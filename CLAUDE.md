# UTSHOB (ShareTheTable): project rules for Claude

CSE471 Group 08, Section 03, Fall 2026. Event planning plus surplus-food redistribution for Bangladesh's 8 divisions.

**The single most important rule:** every line must be something a student can explain and live-modify in a viva.
Simple and conventional beats clever. If a choice is between "shorter but magic" and "longer but obvious", pick obvious.

## Source of truth (in priority order)
1. "Decisions" below
2. `docs/SPEC.md` (12 assessed features + common workflows, as checklists)
3. `docs/DATA_MODEL.md`, `docs/API_ROUTES.md`, `docs/PLAN.md`
4. `docs/source/functional-requirements.docx` (assignment), then `docs/source/proposal.docx`

If something is ambiguous, ask the user. Do not guess silently.

## Team and feature ownership (each member demos their own)
| ID | Member | Features |
|---|---|---|
| 22201813 | Tareq Sujat | M1-A, M2-A, M3-A (Gemini), M3-B |
| 23201544 | Tasmin Akter Ridita | M1-B, M2-B (Nominatim), M3-C, M3-D (SSLCOMMERZ) |
| 22301024 | Mehreen Mallick Fiona | M1-C, M2-C (Telegram), M3-E, M3-F |

Labs: Module 1 = Lab 5, Module 2 = Lab 6, Module 3 = Lab 7.

## Stack (fixed)
- JavaScript only, ES modules (`"type": "module"`) on both sides.
- Server: Node 24, Express, Mongoose (MongoDB), zod, bcryptjs, jsonwebtoken, helmet, express-rate-limit, cors, multer, dotenv.
- Client: React + Vite, React Router, TailwindCSS, Leaflet + react-leaflet (OpenStreetMap tiles).
- External APIs: Gemini, Nominatim, Telegram Bot API, SSLCOMMERZ sandbox. All called with Node's built-in `fetch` + `AbortSignal.timeout(...)`. No axios.
- Tests: Vitest + Supertest + mongodb-memory-server.
- Deploy: Vercel, as two projects from one repo (see Decisions).

Do not add a library unless the user agrees. Never use a UI kit, CMS, site builder or generated full-page template.

## Decisions (these win over all docs)
- Database is **MongoDB** (ignore "PostgreSQL" in the proposal).
- Plans: Starter $0, Plus $15, Pro $25, Enterprise $45, stored in the `plans` collection with a BDT price at a fixed rate of 120 (৳0 / ৳1,800 / ৳3,000 / ৳5,400). Limits (Starter/Plus/Pro/Enterprise): active events 1/3/5/10, organizers per event 1/3/5/10, AI requests per month 10/30/60/100, budget scenarios per event 1/2/5/10, branches 0/0/0/3. Feature gates are listed in `docs/SPEC.md` under M3-D. **Enforced in the backend.** After expiry, existing records stay readable and are never deleted.
- Payments: **SSLCOMMERZ sandbox** (one init call plus one validation call, simpler than bKash's token, create, execute and query flow). Verified in the backend through the validation API. Confirmation is idempotent.
- Currency: BDT (৳) everywhere.
- Vercel: **two projects** from the same repo. `client/` is a static Vite build. `server/` is the Express app exported from `server/api/index.js` as one serverless function, with a cached Mongo connection. Locally, `server/server.js` calls `app.listen`.
- No background workers (serverless). Time-based rules (expired listings, expired credentials, plan expiry, payment holds) are checked **lazily**, at request time, inside the query guard itself. Reminders come from a "send due reminders" endpoint, called by a button or a Vercel Cron.
- Uploaded credential files are stored in MongoDB (`files` collection, 1 MB max, PDF/PNG/JPG), because Vercel has no persistent disk.
- Auth: JWT sent as `Authorization: Bearer <token>`, stored in `localStorage` on the client. This is a simple, explainable choice; its XSS trade-off is noted in GLOSSARY.
- Design: our own design system (below). It is not based on the mockup image. The mockup's **demo scenario** is kept as seed data.

## Design system (hand-written Tailwind)
- Mood: "festival table" (Utshob means festival). Warm, calm, trustworthy.
- Colours (defined once as CSS variables in `client/src/index.css` and mapped in Tailwind theme):
  - `ink` #1C2B2D (text) · `paper` #FBF8F3 (page background) · `card` #FFFFFF
  - `primary` #0E5E5A (deep teal: nav, primary buttons) · `primary-soft` #E3F1EF
  - `accent` #E39B2D (marigold: highlights, active nav marker) · `accent-soft` #FBEFD9
  - `danger` #B8433A · `warning` #B7791F · `success` #2F7D4F · `muted` #6B7A7C · `line` #E7E1D7
- Type: headings in **Fraunces** (serif), body in **Inter**, with `Noto Sans Bengali` as fallback so `৳` renders.
- Layout: left sidebar (role-based links) on md+; on mobile a top bar with a menu button that opens the same sidebar as a drawer. Content is max-width 1200px with a 16px side gutter on mobile.
- Components live in `client/src/components/ui/` (Button, Card, Badge, Input, Select, Modal, Table, StatTile, EmptyState, ErrorState, Spinner, EstimateLabel). Each is small, has no hidden behaviour, and is written by hand.
- Every page has **loading, empty and error states**. No dead buttons: if a feature is gated, the button shows why ("Plus plan required").
- A small "Demo data" badge in the top bar while `DEMO_MODE=true`.

## Folder layout
```
server/
  app.js            express app (middleware, routes, error handler); no listen()
  server.js         local dev: connect DB + app.listen
  api/index.js      Vercel entry: export the app
  config/           env.js (reads + checks env vars), db.js (cached mongoose connect), constants.js (divisions, enums)
  models/           one Mongoose model per collection, named by entity (Event.js, Booking.js ...)
  validators/       zod schemas, one file per feature (m1a.events.schemas.js ...)
  routes/           one router per feature (m1a.events.routes.js ...)
  controllers/      one controller file per feature (m1a.events.controller.js ...)
  services/         one file per external API (gemini.service.js, nominatim.service.js, telegram.service.js, sslcommerz.service.js) + plan.service.js, audit.service.js, notify.service.js
  middleware/       auth.js (requireAuth, requireRole, requireApproved), validate.js, planGate.js, errorHandler.js, idempotency.js
  seed/             seed.js (npm run seed) + data builders
  tests/            *.test.js (Vitest + Supertest + mongodb-memory-server)
client/src/
  api/              client.js (fetch wrapper adding the token) + one file per feature (m1a.events.api.js ...)
  pages/            one folder per feature (m1a-events/, m1b-providers/ ...) + common/ (login, signup, profile, admin)
  components/       ui/ (design system) + layout/ (Sidebar, Topbar, AppShell) + shared widgets (MapPicker ...)
  hooks/            useAuth.js, useFetch.js
  context/          AuthContext.jsx
docs/               SPEC, DATA_MODEL, API_ROUTES, PLAN, GLOSSARY, DEMO_SCRIPT, walkthrough/<FEATURE-ID>.md
```
A request always flows like this: **route → middleware (auth, validate, plan gate) → controller → model → response**. Controllers stay short. Logic shared by two features goes into a service.

## Code rules
- Express route files only wire things up: `router.post('/', requireAuth, requireRole('host'), validate(schema), controller.create)`.
- Controllers: `async (req, res) => {...}`. Errors are thrown with `httpError(status, message)` and handled by the central `errorHandler`. Use Express 5, which forwards async errors on its own, so no try/catch boilerplate is needed.
- Authorization on **every** route: role check plus ownership/record check (e.g., `event.owner` or `event.organizers` includes `req.user._id`). Admin can read everything.
- Validate every body/query with zod. Reject unknown fields that matter.
- Correctness patterns (use exactly these, consistently):
  - **Atomic conditional update**: `findOneAndUpdate({ _id, <guard> }, { $inc / $set }, { returnDocument: 'after' })`. If it returns `null`, the guard failed, so respond 409. Used for surplus reservations, plan quotas, payment confirmation, batch adjustments.
  - **Unique index as a lock**: venue hour slots (`venueslots`), one active task per reservation (`activeKey`), surplus dedupe (`dedupeKey`), one review per booking, one point entry per action.
  - **Idempotency-Key header**: the client sends a UUID per form submit; it is stored with a unique index; a repeat returns the existing record.
  - Separate quantity fields (collected / received / accepted / rejected / distributed / remaining / disputed / lost). Never one "quantity" reused for different meanings.
  - Never hard-delete completed or cancelled records. Use `status` + `cancelReason`. (Lock rows in `venueslots` are not records and may be deleted.)
  - Versioned budgets (embedded `versions[]`) and quotations (one document per version).
- Every external API call: timeout, try/catch, a logged error, and a **visible fallback** in the UI.
- Security: helmet, rate limiting (stricter on auth and public endpoints), bcrypt (cost 10), JWT secret from env, CORS limited to `CLIENT_ORIGIN`. `.env` is never committed; `.env.example` is.
- **No hardcoded display data.** Components render only what the API returns. Enumerations (divisions, roles, units) come from `GET /api/meta`.
- Comments: short, and only where the logic is not obvious (the "why", not the "what").
- Prefer short functions and clear names over abstractions. No metaprogramming, no generic CRUD factories.

## Git
- Remote: https://github.com/tareqsujat-cmd/Utshob-.git (branch `main`).
- Use the machine's git identity. **Never** change or fake author identity. The team agreed that all features are committed under this identity.
- Small commits, one vertical slice each, tagged with the feature: `feat(M1-A): create event form + POST /api/events`. Other prefixes: `chore(setup)`, `docs(M1-A)`, `test(M3-C)`, `fix(M2-C)`.
- Commit only after the slice runs.

## Per-feature definition of done
1. Backend routes + validation + authorization + model indexes.
2. UI page(s) with loading/empty/error states, responsive.
3. Seed data for the feature.
4. Tests for its correctness rule(s).
5. Actually ran it (server + client) and saw it work.
6. `docs/walkthrough/<FEATURE-ID>.md` (7 sections: what, file map, request flow, key snippets, viva Q&A, 3 drills, 60-second demo script).
7. Box ticked in `docs/SPEC.md`, small commit.

## Commands (run from the project root)
```
npm run setup      # install server + client packages
npm run db         # local MongoDB on :27017 (data in server/.localdb); skip if using Atlas
npm run seed       # wipe + insert demo data (password for all demo accounts: Demo@1234)
npm run dev        # API on :5000 (node --watch) + React on :5173 (Vite proxies /api)
npm test           # server tests (Vitest + Supertest + mongodb-memory-server)
npm run build      # production build of the client
```
Windows note for Git Bash: set `MSYS_NO_PATHCONV=1` before passing URL paths like `/login` as arguments.

## Teaching mode
The user must understand everything. Explain a new concept before using it and add it to `docs/GLOSSARY.md`.
When the user says "explain <file>", walk through it top to bottom in plain language.
Never claim something works unless it was run.
