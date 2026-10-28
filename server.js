"use strict";
const path = require("path");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const Database = require("better-sqlite3");

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || ""; // optional shared secret for writes (demo-grade protection)
const db = new Database(process.env.DB_FILE || path.join(__dirname, "shridevi.db"));
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS docs (
    col TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL,
    PRIMARY KEY (col, id)
  );
  CREATE INDEX IF NOT EXISTS idx_docs_col ON docs (col, updated_at);
`);
const sql = {
  list: db.prepare("SELECT id, data FROM docs WHERE col = ? ORDER BY updated_at DESC LIMIT 1000"),
  get: db.prepare("SELECT data FROM docs WHERE col = ? AND id = ?"),
  put: db.prepare(`INSERT INTO docs (col, id, data, updated_at) VALUES (?, ?, ?, ?)
                   ON CONFLICT (col, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`),
  del: db.prepare("DELETE FROM docs WHERE col = ? AND id = ?"),
  count: db.prepare("SELECT COUNT(*) AS n FROM docs WHERE col = ?")
};

/* ---------- validation: the browser escapes HTML, the server enforces it ---------- */
const bad = m => Object.assign(new Error(m), { status: 400 });
const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const unesc = s => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
const clean = (v, n) => esc(unesc(String(v == null ? "" : v).trim().slice(0, n)));
const DEPTS = ["ICU", "Emergency", "Pediatrics", "General Ward"];
const STATUS = ["Admitted", "Observation", "Critical", "Stable", "Discharged"];

function cleanPatient(b) {
  const age = Number(b.age), digits = String(b.nid || "").replace(/\D/g, "");
  const masked = /^(XXXX-XXXX|\*\*\*-\*\*)-\d{4}$/.test(String(b.nid || ""));
  if (!clean(b.name, 80)) throw bad("name is required");
  if (String(b.ph || "").replace(/\D/g, "").length < 7) throw bad("phone needs at least 7 digits");
  if (!masked && digits.length < 4) throw bad("national id needs at least 4 digits");
  if (!DEPTS.includes(b.dept)) throw bad("unknown department");
  if (!STATUS.includes(b.st)) throw bad("unknown status");
  if (!(age > 0 && age < 121)) throw bad("age must be between 1 and 120");
  return {
    name: clean(b.name, 80), ph: clean(b.ph, 30),
    nid: masked ? String(b.nid) : (digits.length === 9 ? "***-**-" : "XXXX-XXXX-") + digits.slice(-4), // only last 4 digits are ever stored
    addr: clean(b.addr, 200), date: clean(b.date, 10), dept: b.dept, st: b.st,
    sex: b.sex === "M" ? "M" : "F", age, bt: clean(b.bt, 4), dx: clean(b.dx, 200), al: clean(b.al, 120),
    rx: clean(b.rx, 200), vit: clean(b.vit, 200), ts: Number(b.ts) || Date.now(), bed: b.bed ? clean(b.bed, 12) : null
  };
}
function cleanState(b) {
  const arr = (a, n) => (Array.isArray(a) ? a.slice(0, n) : []);
  return {
    appts: arr(b.appts, 50).map(a => ({ d: clean(a.d, 20), t: clean(a.t, 12), m: a.m === "In person" ? "In person" : "Video", dr: clean(a.dr, 60) })),
    meds: arr(b.meds, 20).map(v => (v ? 1 : 0)),
    q: arr(b.q, 200).map(Number).filter(Number.isFinite),
    serving: Number(b.serving) || 0, nextT: Number(b.nextT) || 0,
    inv: arr(b.inv, 50).map(n => Math.max(0, Number(n) || 0))
  };
}
const COLS = { patients: { clean: cleanPatient, max: 5000 }, state: { clean: cleanState, max: 10 } };

/* ---------- app ---------- */
const app = express();
app.set("trust proxy", 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.tailwindcss.com", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"]
    }
  }
}));
app.use(cors({ origin: process.env.CORS_ORIGIN || false }));
app.use(express.json({ limit: "64kb" }));
app.use("/api", rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false }));

const known = (req, res, next) => (COLS[req.params.col] ? next() : res.status(404).json({ error: "unknown collection" }));
const validId = (req, res, next) => (/^[A-Za-z0-9_-]{1,64}$/.test(req.params.id) ? next() : res.status(400).json({ error: "invalid id" }));
const auth = (req, res, next) => (API_KEY && req.get("x-api-key") !== API_KEY ? res.status(401).json({ error: "invalid api key" }) : next());

app.get("/api/health", (req, res) => res.json({ ok: true, patients: sql.count.get("patients").n, time: new Date().toISOString() }));

app.get("/api/:col", known, (req, res) => {
  const rows = sql.list.all(req.params.col).map(r => ({ id: r.id, data: JSON.parse(r.data) }));
  const f = String(req.query.orderBy || "");
  if (/^[a-z_]+$/i.test(f)) {
    const dir = req.query.dir === "desc" ? -1 : 1;
    rows.sort((a, b) => { const x = a.data[f], y = b.data[f]; return x == null ? 1 : y == null ? -1 : (x < y ? -1 : x > y ? 1 : 0) * dir; });
  }
  res.json(rows.slice(0, Math.min(Number(req.query.limit) || 200, 1000)));
});

app.get("/api/:col/:id", known, validId, (req, res) => {
  const r = sql.get.get(req.params.col, req.params.id);
  r ? res.json({ id: req.params.id, data: JSON.parse(r.data) }) : res.status(404).json({ error: "not found" });
});

app.put("/api/:col/:id", known, validId, auth, (req, res, next) => {
  try {
    const { col, id } = req.params, spec = COLS[col];
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) throw bad("body must be a JSON object");
    if (!sql.get.get(col, id) && sql.count.get(col).n >= spec.max) return res.status(507).json({ error: "collection is full" });
    const data = spec.clean(req.body);
    sql.put.run(col, id, JSON.stringify(data), Date.now());
    res.json({ id, data });
  } catch (e) { next(e); }
});

app.delete("/api/:col/:id", known, validId, auth, (req, res) => {
  sql.del.run(req.params.col, req.params.id);
  res.status(204).end();
});

app.use(express.static(path.join(__dirname, "..", "frontend")));
app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.status ? err.message : "server error" }));

app.listen(PORT, () => console.log(`SHRIDEVI dashboard running at http://localhost:${PORT}`));
