# UTSHOB · Share the Table

Event planning with budgets, provider bookings and AI help, plus redistribution of surplus food to orphanages and street-outreach teams, across Bangladesh's eight divisions.
CSE471 (System Analysis and Design) · Group 08 · Section 03 · Fall 2026.

| ID | Member | Features |
|---|---|---|
| 22201813 | Tareq Sujat | M1-A Event management · M2-A Expenses & contributions · M3-A AI assistant (Gemini) · M3-B Event reports |
| 23201544 | Tasmin Akter Ridita | M1-B Provider management · M2-B Provider search (Nominatim) · M3-C Quotations & bookings · M3-D Subscriptions (SSLCOMMERZ) |
| 22301024 | Mehreen Mallick Fiona | M1-C Surplus food · M2-C Collection logistics (Telegram) · M3-E Delivery confirmation · M3-F Donation & waste history |

> This README grows with each phase. Feature → files/routes table, architecture diagram and deploy guide are completed in Phase 5–6.

## Live demo
- Website: **https://utshob-pu8r.vercel.app**
- API: https://utshob-gilt.vercel.app (health check: `/api/health`)

## Deployment (Vercel + MongoDB Atlas)
Two Vercel projects are built from this one repository; every push to `main` redeploys both.

| Vercel project | Root directory | Preset | Environment variables |
|---|---|---|---|
| `utshob` (API, `utshob-gilt.vercel.app`) | `server` | Other | `MONGODB_URI`, `JWT_SECRET`, `DEMO_MODE=true`, `CLIENT_ORIGIN` |
| `utshob-pu8r` (website) | `client` | Vite | `VITE_API_URL=https://utshob-gilt.vercel.app` |

- The API runs as one serverless function (`server/api/index.js`, `server/vercel.json` rewrites every path to it); the Mongo connection is cached between requests (`server/config/db.js`).
- `CLIENT_ORIGIN` must be the website URL (several allowed, comma-separated). Values are cleaned of stray spaces, line breaks and trailing `/`.
- Database: Atlas database `utshob_tareq`, accessed by a user with `readWrite` on that database only, so other databases in the shared cluster can't be touched. The seed script also refuses to wipe a database containing collections that aren't ours.
- After changing an environment variable in Vercel: **Deployments → ⋯ → Redeploy**.

## Stack
MongoDB + Mongoose · Express 5 · React 19 + Vite · TailwindCSS 4 · React Router · Leaflet/OpenStreetMap · Vitest + Supertest + mongodb-memory-server.
External APIs: Gemini, Nominatim, Telegram Bot API, SSLCOMMERZ sandbox.

## Run it locally
Requirements: Node.js 20+ (developed on Node 24).

```bash
npm run setup                      # install server + client packages
cp server/.env.example server/.env # then set JWT_SECRET (any long random string)
npm run db                         # terminal 1: local MongoDB (or set MONGODB_URI to MongoDB Atlas)
npm run seed                       # insert demo data
npm run dev                        # terminal 2: API on :5000 + React on :5173
```
Open http://localhost:5173.

## Demo accounts
All use the password **`Demo@1234`** (synthetic data). The login page also lists them for one-click login.

| Role | Email |
|---|---|
| Administrator | admin@utshob.demo |
| Event host | host@utshob.demo · host2@utshob.demo |
| Orphanage coordinator | orphanage@utshob.demo |
| Outreach coordinator | outreach@utshob.demo |
| Volunteer | volunteer@utshob.demo · volunteer2@utshob.demo |
| Pending coordinator (to demo approval) | pending.orphanage@utshob.demo |
| Provider: venue (Shapla Convention Hall) | venue@utshob.demo |
| Provider: caterer (Bhoj Caterers) | caterer@utshob.demo |
| Provider: planner (Rongdhonu Decor & Events) | decor@utshob.demo |
| Pending provider with documents to review (Nakshi Kitchen) | pending.provider@utshob.demo |

13 more providers across all 8 divisions use `@providers.demo` emails (same password); they are background data for search.

## Tests
```bash
npm test
```
The first run downloads a MongoDB binary (~100 MB) for mongodb-memory-server.

## Project docs
- `CLAUDE.md`: rules, decisions, conventions
- `docs/SPEC.md`: feature checklists (what is done)
- `docs/DATA_MODEL.md`, `docs/API_ROUTES.md`, `docs/PLAN.md`
- `docs/GLOSSARY.md`: concepts explained
- `docs/walkthrough/<FEATURE>.md`: per-feature explanation, viva Q&A, drills, 60-second demo
