# SHRIDEVI Medical Center dashboard: frontend and backend

```
shridevi-dashboard/
  frontend/index.html     the full dashboard (HTML, Tailwind, JS, three.js, Lucide), same page as the live version
  frontend/api-shim.js    connects the page's cloud-sync layer to the backend (does nothing inside claude.ai)
  backend/server.js       Node + Express + SQLite REST API (validation, masking, rate limits)
  backend/package.json
  database/schema.sql     relational schema and the queries shown in the SQL explorer
```

## Run it
Requires Node 18 or newer.
```
cd backend
npm install
npm start
```
Open http://localhost:3000. The server serves the frontend and the API together. Data is stored in `backend/shridevi.db`.

Environment variables: `PORT` (default 3000), `DB_FILE`, `API_KEY` (if set, writes need an `x-api-key` header), `CORS_ORIGIN` (only if the frontend is hosted on another domain; then set `window.API_BASE` before loading `api-shim.js`).

## API
| Method | Path | Purpose |
|---|---|---|
| GET | /api/health | status and patient count |
| GET | /api/patients?orderBy=ts&dir=desc&limit=200 | list registered patients |
| PUT | /api/patients/:id | register or update a patient (validated, ID masked) |
| GET / PUT / DELETE | /api/state/app | shared appointments, medication ticks, queue and stock |

## What is saved
Patients you register, appointments, medication ticks, the token queue and medicine stock. Sample patients, beds and staff are built into the page.

## Before real use
- Add real sign-in (sessions or JWT) and role checks. `API_KEY` is only a demo-level shared secret, and anything in browser code is public.
- Serve over HTTPS and restrict who can reach the server.
- Real patient data falls under health-privacy law (for example India's DPDP Act, HIPAA). Get a compliance review, add audit logs and encrypted backups.
