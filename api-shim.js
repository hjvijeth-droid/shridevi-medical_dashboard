/* Connects the dashboard's cloud-sync layer to the Node/SQLite backend.
   Inside claude.ai the page already has window.claude, so this file does nothing there.
   Optional config before this script: window.API_BASE = "https://api.example.com"; window.API_KEY = "..." */
(function () {
  if (typeof window.claude !== "undefined") return;
  const BASE = window.API_BASE || "", KEY = window.API_KEY || "", POLL = 3000, pokes = new Set();
  async function call(url, opt) {
    const r = await fetch(BASE + url, { ...opt, headers: { "Content-Type": "application/json", ...(KEY ? { "x-api-key": KEY } : {}) } });
    if (r.status === 404) return null;
    if (!r.ok) throw { code: "unavailable", message: "HTTP " + r.status };
    return r.status === 204 ? null : r.json();
  }
  const meta = { fromCache: false, hasPendingWrites: false };
  const snap = (id, d) => ({ id, exists: d != null, data: () => (d == null ? undefined : d), metadata: meta });
  function poll(fetcher, render, error) {
    let last = null, stop = false, busy = false;
    const tick = async () => {
      if (stop || busy || document.hidden) return;
      busy = true;
      try { const v = await fetcher(), s = JSON.stringify(v); if (s !== last) { last = s; render(v); } }
      catch (e) { error && error(e); }
      busy = false;
    };
    pokes.add(tick); tick();
    const t = setInterval(tick, POLL);
    return () => { stop = true; clearInterval(t); pokes.delete(tick); };
  }
  function doc(path) {
    const [c, id] = path.split("/"), u = "/api/" + c + "/" + encodeURIComponent(id);
    return {
      id, path,
      async get() { const r = await call(u); return snap(id, r && r.data); },
      async set(d) { await call(u, { method: "PUT", body: JSON.stringify(d) }); pokes.forEach(f => f()); },
      async update(d) { const r = await call(u); await this.set({ ...((r && r.data) || {}), ...d }); },
      async delete() { await call(u, { method: "DELETE" }); pokes.forEach(f => f()); },
      onSnapshot(next, err) { return poll(async () => { const r = await call(u); return r && r.data; }, d => next(snap(id, d)), err); }
    };
  }
  const qs = rows => ({ docs: rows.map(r => snap(r.id, r.data)), size: rows.length, empty: !rows.length, docChanges: () => [], metadata: meta });
  function coll(c) {
    const o = { f: "", dir: "asc", n: 200 };
    const url = () => `/api/${c}?orderBy=${o.f}&dir=${o.dir}&limit=${o.n}`;
    const api = {
      path: c,
      doc: id => doc(c + "/" + (id || "d" + Date.now().toString(36))),
      orderBy(f, d) { o.f = f; o.dir = d || "asc"; return api; },
      limit(n) { o.n = n; return api; },
      async add(d) { const r = api.doc(); await r.set(d); return r; },
      async get() { return qs((await call(url())) || []); },
      onSnapshot(next, err) { return poll(() => call(url()).then(r => r || []), rows => next(qs(rows)), err); }
    };
    return api;
  }
  window.claude = { use: async n => n === "db" ? { doc, collection: coll } : n === "user" ? { can: () => true, isOwner: () => true, canEdit: () => true } : null };
})();
