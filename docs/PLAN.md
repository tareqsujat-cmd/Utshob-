# UTSHOB: Phased Build Plan

Estimates are **build hours** (code + run + walkthrough doc). They do not include each member's own study time; budget about 2 h per feature for that (reading the walkthrough, doing the 3 drills).
Each phase ends with: tests run, SPEC ticked, an honest report (works / partial / missing), and a pause for approval.

| Phase | Content | Estimate |
|---|---|---|
| 0 | Specs: CLAUDE.md, SPEC, DATA_MODEL, API_ROUTES, PLAN, GLOSSARY | done (this) |
| 1 | Foundation | 10–12 h |
| 2 | Module 1 (Lab 5): M1-A, M1-B, M1-C | 22–26 h |
| 3 | Module 2 (Lab 6): S1 checkout, M2-A, M2-B, M2-C | 22–26 h |
| 4 | Module 3 (Lab 7): M3-A … M3-F | 30–36 h |
| 5 | Polish, full seed, test pass, demo scripts, README | 8–10 h |
| 6 | Vercel deploy + verify public URL | 3–4 h |
| | **Total** | **≈ 95–115 h** |

Because labs come in order, **deploy a first version at the end of Phase 2** (not only in Phase 6). Graders may want a live URL in Lab 5, and deployment problems surface early.

---

## Phase 1: Foundation (10–12 h)
1. Repo skeleton: root `package.json` with `dev` / `seed` / `test` scripts, `server/`, `client/`, `.gitignore`, `.env.example`, README stub. (`chore(setup)`)
2. Server: `app.js` (helmet, cors, json, rate limit, routes, errorHandler), `config/env.js`, `config/db.js` (cached connection), `server.js`, `api/index.js`. Health route `GET /api/health`.
3. Models `User`, `Organization`, `AuditLog`, `Notification`, `AppSetting`, `Plan`. `GET /api/meta`.
4. Auth: signup / login / me / logout, bcrypt, JWT, `requireAuth`, `requireRole`, `requireApproved`, zod `validate`.
5. `audit.service.log()`, `notify.service.notify()` (in-app only for now).
6. Admin: approvals page, audit log page.
7. Client: Vite + Tailwind + design tokens + fonts, `components/ui/*`, AppShell (sidebar/drawer, top bar, Demo badge, bell), AuthContext, protected routes, login/signup/profile, per-role dashboard placeholders that show **real** API counts.
8. Seed skeleton: plans, one user per role, organizations, admin. `npm run seed`.
9. Test harness: Vitest + mongodb-memory-server + first tests (auth, role permission 403).
10. `docs/GLOSSARY.md` extended; walkthrough `docs/walkthrough/FOUNDATION.md` (common workflows are not graded, but you'll still be asked about login).

## Phase 2: Module 1, Lab 5 (22–26 h)
| Feature | Slices (one commit each) | Est. |
|---|---|---|
| **M1-B** Providers (build first: M1-A budget alerts and M1-C caterer posting refer to providers) | profile CRUD → packages → blocked dates → credential upload (files) → admin review → bookable rule + public page + disclaimer → expiry flagging → seed → tests → walkthrough | 7–8 h |
| **M1-A** Events | create/list/search → edit with reason + history → copy/cancel/reschedule + notifications → organizers + plan limits (plan.service minimal) → budget scenarios/versions + summary/alerts → invitation + public RSVP → menu units + cooking batches → attendance suggest/apply (guarded) → seed (wedding scenario) → tests → walkthrough | 9–10 h |
| **M1-C** Surplus | listing + missingInfo + dedupeKey → food requests → matching with reasons → reservation guard + IK + split → cancel/release + lazy expiry → seed → tests (concurrent reservations) → walkthrough | 6–7 h |
| Deploy v1 | Vercel client + server, Atlas, smoke test | 2 h |

## Phase 3: Module 2, Lab 6 (22–26 h)
| Feature | Slices | Est. |
|---|---|---|
| **S1** Checkout (Ridita) | `payments` model → sslcommerz.service (init, validate, timeout) → callbacks + idempotent confirm → result page → tests (double callback) | 4 h |
| **M2-A** Expenses | expenses CRUD + void → cost groups + split (plan gate) → split summary → contributions (pledged/received) → manual receive → sandbox pay → sponsorship + fulfilment gates → tests → walkthrough | 6–7 h |
| **M2-B** Search | nominatim.service + /geo routes → MapPicker (Leaflet, draggable pin, confirm) + manual fallback → matching/scoring with reasons, ≤10/category, limited history → capacity + outside catering flags → results map → walkthrough | 6–7 h |
| **M2-C** Logistics | tasks + activeKey/IK → status transitions + partial/missed release → telegram.service + link/verify → notify with Telegram state → retry + fault toggle → send-due reminders + cron → tests (retry no duplicate) → walkthrough | 7–8 h |

## Phase 4: Module 3, Lab 7 (30–36 h)
| Feature | Slices | Est. |
|---|---|---|
| **M3-D** Subscriptions (first: other gates depend on it) | plans page → checkout → verify → effective plan + lazy expiry → usage page → complete all limit/feature gates → tests | 5 h |
| **M3-C** Quotes and bookings | quote requests → versions → compare → approve/reject + budget version → booking + venueslots overlap → deposit → cancel + history → provider cancel + alternatives → complete + review/response → tests (overlap, concurrent) → walkthrough | 9–10 h |
| **M3-A** AI | gemini.service (JSON schema, timeout) → quota guard + refund → 3 suggestion types → approve/apply + reject → Estimate labels + manual fallback → walkthrough | 5–6 h |
| **M3-E** Confirmation | orphanage form → outreach form → equations → dispute/resolve → points ledger + correction → impact summary → tests → walkthrough | 5–6 h |
| **M3-F** History | waste records → corrections (approve/apply/audit) → destination change + safety rule → reconciliation → history search → tests → walkthrough | 5–6 h |
| **M3-B** Reports | report aggregation → food outcomes separation → recognition points → CSV + detailed + consolidated gates → walkthrough | 4 h |

## Phase 5: Polish (8–10 h)
Full seed across 8 divisions + mockup scenario, admin reset, the remaining tests, responsive pass on phone width, empty/error states audit, `DEMO_SCRIPT.md`, README with architecture diagram and feature table, GLOSSARY complete.

## Phase 6: Deploy (3–4 h)
Final Vercel deploy, env vars, SSLCOMMERZ success URLs pointed at the deployed API, Telegram/Gemini keys, run through DEMO_SCRIPT on the public URL.

---

## Cut list (cut in this order if time runs short; never cut the 12 features' core or correctness)
1. Enterprise branches + consolidated report (keep the gate, show "Enterprise feature" screen)
2. Reusable event templates (copy-previous-event already covers reuse)
3. Assigned approvers / team approvals (keep as plan gate flags only)
4. Host-side reminders (Plus); collection reminders stay
5. Reverse geocoding on pin drag (keep lat/lng + typed address)
6. Complaint reporting on bookings (not in assignment text)
7. Public contribution page (organizers record contributions)
8. Telegram webhook (getUpdates linking is enough)

## Risks and mitigations
| Risk | Mitigation |
|---|---|
| External API down during viva | Every API has a visible fallback; `DEMO_SCRIPT.md` backup path; the fault toggle shows the Telegram fallback on purpose |
| SSLCOMMERZ IPN cannot reach localhost | Success callback is a browser POST, so it works locally; validation is server → gateway; IPN only on deployed URL |
| Vercel cold start + Mongo connection limits | Cached connection in `config/db.js`; Atlas M0 |
| mongodb-memory-server downloads ~100 MB mongod on first test run | Run `npm test` once early on each machine |
| Nominatim usage policy (1 req/s, no autocomplete) | Search on submit, cache, identifying User-Agent |
| Commit history must reflect each member's work | See open question in the Phase 0 report |
