# UTSHOB: API Routes

Base URL: `/api`. JSON in, JSON out. Errors: `{ "error": "message", "details"?: [...] }` with a proper status code.
Auth: `Authorization: Bearer <jwt>`. Every route except those marked **public** requires login.
"Approved" = account `approvalStatus: 'approved'` (enforced by `requireApproved`).
`IK` = route accepts an `Idempotency-Key` header (a repeat returns the same record, status 200).
`Plan:` = backend plan check (`planGate` middleware or `plan.service`).

Status codes used: 200 OK · 201 Created · 400 validation · 401 not logged in · 402 plan limit/feature (with `upgradeTo`) · 403 not allowed · 404 not found · 409 conflict (overlap, over-reservation, duplicate) · 502 external API failed (with fallback hint).

---

## Common

| Method | Path | Who | Purpose |
|---|---|---|---|
| POST | /auth/signup | public | create account (provider/coordinators start pending) |
| POST | /auth/login | public | returns `{ token, user }` (rate-limited) |
| POST | /auth/logout | any | audit entry; client drops token |
| GET | /auth/me | any | current user + effective plan |
| PATCH | /users/me | any | update profile |
| PATCH | /users/me/password | any | change password |
| GET | /meta | public | divisions, districts, roles, units, categories, event types |
| POST | /organizations | coordinator | register my organization (pending) |
| GET | /organizations/mine | coordinator | my organization |
| GET | /notifications | any | my notifications (+ unread count) |
| PATCH | /notifications/:id/read | owner | mark read |
| GET | /admin/approvals | admin | pending users + organizations |
| PATCH | /admin/users/:id/approval | admin | approve/reject user `{ status, note }` |
| PATCH | /admin/organizations/:id/approval | admin | approve/reject organization |
| GET | /admin/audit-logs | admin | filter `entityType, entityId, actor, from, to` |
| POST | /admin/demo/reset | admin | re-run seed (only when `DEMO_MODE=true`) |
| PATCH | /admin/settings/:key | admin | e.g. `telegramFaultInjection` |

## M1-A Event management (host)

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | /events | host | my events (owner or organizer); query `q, status, from, to` |
| POST | /events | host, approved | Plan: active events |
| GET | /events/:id | organizer | |
| PATCH | /events/:id | organizer | `reason` required for guestCount/budgetTotal/location/dietary/requiredServices changes → audit (dates change via /reschedule) |
| POST | /events/:id/plan | organizer | draft -> planned (guarded) |
| POST | /events/:id/complete | owner | planned -> completed (after start time) |
| POST | /events/:id/copy | organizer | new draft; Plan: active events |
| POST | /events/:id/cancel | owner | `{ reason }` → notifications, bookings flagged |
| POST | /events/:id/reschedule | owner | `{ startsAt, endsAt, reason }` → notifications, venue recheck |
| GET | /events/:id/history | organizer | requirement-change history (audit log) |
| PUT | /events/:id/organizers | owner | `{ emails: [] }`; Plan: organizers |
| GET | /events/:id/budgets | organizer | scenarios with versions |
| POST | /events/:id/budgets | organizer | new scenario; Plan: budget scenarios |
| PATCH | /budgets/:id | organizer | `{ lines, reason, version }` → new version (409 if version is stale) |
| PATCH | /budgets/:id/primary | organizer | make primary |
| GET | /events/:id/budget-summary | organizer | totals + alerts (over budget, missing charges, quotes vs estimates) |
| PUT | /events/:id/invitation | organizer | heading, message, theme, rsvpDeadline, isPublished |
| GET | /public/invitations/:slug | **public** | invitation page data |
| POST | /public/invitations/:slug/rsvp | **public** | upsert by phone (rate-limited) |
| GET | /events/:id/rsvps | organizer | list + totals |
| PUT | /events/:id/menu | organizer | `{ menu, reason }`; reason required when changing an existing menu; unit can't change once batches exist |
| GET | /events/:id/food-plan | organizer | `?attendance=`; menu, batches, required vs completed/started/planned per dish, confirmed RSVP count |
| POST | /events/:id/batches | organizer | add batch (unit must match menu item) |
| PATCH | /batches/:id/status | organizer | planned→started→completed / cancelled |
| POST | /events/:id/food-plan/suggest | organizer | `{ attendance? }` → suggested changes to planned batches only |
| POST | /events/:id/food-plan/apply | organizer | apply; guarded per batch (`status: 'planned'`); returns applied + skipped |

## M1-B Provider management

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | /providers/me | provider | my profile + credential status + bookable flag with reasons |
| PUT | /providers/me | provider | create/update profile |
| POST | /providers/me/packages | provider | add package |
| PATCH | /providers/me/packages/:pkgId | provider | edit or archive (`isArchived`) |
| PUT | /providers/me/blocked-dates | provider | replace blocked dates list |
| POST | /providers/me/credentials | provider | multipart (`file` ≤ 1 MB) |
| GET | /providers/me/credentials | provider | list |
| GET | /files/:id | owner, admin | stream file |
| GET | /providers | host, admin (any logged-in) | directory of approved providers `?category, division, q` with `bookable`, `priceFrom` |
| GET | /providers/:id | any | public profile: packages (non-archived), reviewed credentials (type, masked number, review date, expiry, valid) + bookability |
| GET | /admin/credentials | admin | queue `?status=pending` |
| PATCH | /admin/credentials/:id | admin | `{ status, note }` → audit |
| POST | /admin/credentials/expiry-check | admin | flag upcoming bookings of providers with expired credentials (also runs lazily) |

## M1-C Surplus food

| Method | Path | Who | Notes |
|---|---|---|---|
| POST | /surplus | host (own event), approved provider | dedupeKey → 409 on duplicate; computes `missingInfo` |
| GET | /surplus | approved coordinator, admin | open listings (lazy-closes expired); filters `division, district, foodType` |
| GET | /surplus/mine | host, provider | my listings with reserved/available |
| GET | /surplus/:id | poster, coordinator, admin | detail + reservations |
| PATCH | /surplus/:id | poster | info fields only; cannot lower quantity below reserved |
| POST | /surplus/:id/cancel | poster | only if nothing reserved; else 409 |
| POST | /food-requests | approved coordinator | |
| GET | /food-requests/mine | coordinator | |
| PATCH | /food-requests/:id | coordinator (same org) | |
| POST | /food-requests/:id/cancel | coordinator | |
| GET | /food-requests/:id/matches | coordinator | ranked listings + reasons + suggested qty |
| POST | /reservations | coordinator | IK; `{ listingId, requestId, quantity }` guarded `$inc` → 409 "Only X left" |
| GET | /reservations | coordinator, poster | mine / my org / on my listings |
| POST | /reservations/:id/cancel | coordinator | releases uncollected qty |

## Shared S1 Sandbox checkout (owner M3-D)
Checkout is started by the feature routes (`/contributions/:id/checkout`, `/bookings/:id/deposit`, `/subscriptions/checkout`), which all call `sslcommerz.service.initPayment()`.

| Method | Path | Who | Notes |
|---|---|---|---|
| POST | /payments/sslcommerz/success | **public** (gateway browser POST) | validate via SSLCOMMERZ API → idempotent confirm → redirect to client `/payments/:tranId` |
| POST | /payments/sslcommerz/fail | **public** | mark failed → redirect |
| POST | /payments/sslcommerz/cancel | **public** | mark cancelled → redirect |
| POST | /payments/sslcommerz/ipn | **public** | same confirm logic (works only on the deployed URL) |
| GET | /payments/:tranId | payer, admin | status for the result page |
| POST | /payments/:tranId/verify | payer, admin | "Check status": asks the gateway by tran_id and confirms (idempotent) |

## M2-A Expenses and contributions

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | /events/:id/expenses | organizer | |
| POST | /events/:id/expenses | organizer | |
| PATCH | /expenses/:id | organizer | |
| POST | /expenses/:id/void | organizer | `{ reason }` (no delete) |
| PUT | /events/:id/split | organizer | `{ method, groups }`; Plan: customSplits for percentage/custom |
| GET | /events/:id/split-summary | organizer | owed / received / outstanding per group |
| GET | /events/:id/contributions | organizer | |
| POST | /events/:id/contributions | organizer | Plan: sponsorshipOffers for type sponsorship |
| PATCH | /contributions/:id | organizer | edit pledge details |
| POST | /contributions/:id/receive | organizer | manual cash or in-kind receipt |
| POST | /contributions/:id/checkout | organizer | sandbox payment for cash → `{ gatewayUrl }` |
| PATCH | /contributions/:id/fulfilment | organizer | Plan: sponsorshipTracking |
| POST | /contributions/:id/cancel | organizer | `{ reason }` |

## M2-B Provider search (Nominatim)

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | /geo/search?q= | host | Nominatim proxy (BD only, 6 s timeout, cached); 502 → client shows manual form |
| GET | /geo/reverse?lat=&lng= | host | address for a corrected pin |
| POST | /providers/search | host | `{ location, date, guestCount, budget, categories, services, preferences, venueId? }` → `{ [category]: { results (≤10), note } }` each with `reasons[]`, `flags[]`, `reviewCount`, `limitedHistory` |

## M2-C Collection logistics (Telegram)

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | /volunteers | coordinator | approved volunteers (division filter) |
| POST | /reservations/:id/tasks | coordinator (same org) | IK + activeKey → one active task per reservation |
| GET | /tasks | coordinator (org), volunteer (assigned) | `?status=` |
| PATCH | /tasks/:id/status | coordinator, assigned volunteer | `{ status, quantityCollected?, delayMinutes?, reason? }`; valid transitions only |
| POST | /tasks/reminders/send-due | coordinator, admin, or cron (`x-cron-secret`) | collection reminders are never plan-gated; dedupeKey per reminder |
| GET | /notifications/telegram-log | coordinator, admin | failed/sent Telegram deliveries for my tasks |
| POST | /notifications/:id/retry | coordinator, admin | re-send same notification (guarded: status failed → pending) |
| POST | /telegram/link | any | generate link code + bot username |
| POST | /telegram/verify | any | reads getUpdates, stores chatId |
| DELETE | /telegram/link | any | unsubscribe |

## M3-A AI assistant (Gemini)

| Method | Path | Who | Notes |
|---|---|---|---|
| POST | /ai/suggestions | organizer | `{ eventId, type: budget/food/invitation, note? }`; quota guard; 502 → manual fallback |
| GET | /ai/suggestions?eventId= | organizer | history |
| POST | /ai/suggestions/:id/approve | organizer | guarded; applies change (budget version or scenario / menu + planned batches / invitation) |
| POST | /ai/suggestions/:id/reject | organizer | `{ reason? }` |
| GET | /ai/usage | host | used / limit this month |

## M3-B Event reports

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | /events/:id/report | organizer | finance + food outcomes; detailed section if Plan: detailedReports |
| GET | /events/:id/report.csv | organizer | Plan: downloadableReports |
| GET | /reports/consolidated | host | Plan: consolidatedReports (all events / by branch) |

(Recognition points for received contributions are created inside M2-A's receive/payment flow through `points.service`, unique per contribution.)

## M3-C Quotations and bookings

| Method | Path | Who | Notes |
|---|---|---|---|
| POST | /quote-requests | organizer | provider must be bookable |
| GET | /quote-requests | host (mine), provider (to me) | `?eventId, status` |
| POST | /quote-requests/:id/quotes | provider | new version (previous → superseded) |
| POST | /quote-requests/:id/revision | organizer | `{ note }` |
| GET | /events/:id/quotes/compare?category= | organizer | latest versions side by side |
| POST | /quotes/:id/approve | organizer | records approval; new budget version (source quote_approval) |
| POST | /quotes/:id/reject | organizer | |
| POST | /bookings | organizer | IK; `{ quoteId }`; bookable check; venue → hour slots (409 on overlap) |
| GET | /bookings | host, provider | searchable `?q, status, from, to` |
| GET | /bookings/:id | customer, provider | with history |
| POST | /bookings/:id/deposit | customer | sandbox checkout |
| POST | /bookings/:id/cancel | customer or provider | `{ reason }`; provider cancel → notify + alternatives |
| GET | /bookings/:id/alternatives | customer | M2-B matching, excluding cancelled provider |
| POST | /bookings/:id/complete | provider | only after eventEnd |
| POST | /bookings/:id/review | customer | one per completed booking (unique index) |
| POST | /reviews/:id/response | provider | |
| GET | /providers/:id/reviews | any | |

## M3-D Subscriptions (SSLCOMMERZ)

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | /plans | public | from `plans` collection |
| GET | /subscriptions/me | host | effective plan, endsAt, usage vs limits |
| POST | /subscriptions/checkout | host | `{ planCode }` → pending subscription + payment → `{ gatewayUrl }` |
| GET | /subscriptions/history | host | all subscriptions (never deleted) |
| PUT | /users/me/branches | host | Plan: branches (Enterprise ≤ 3) |

## M3-E Delivery confirmation

| Method | Path | Who | Notes |
|---|---|---|---|
| POST | /tasks/:id/confirmation | orphanage or outreach coordinator (task's org) | IK; equation validated; awards points via ledger |
| GET | /confirmations | coordinator (org), poster (own listings), admin | |
| POST | /confirmations/:id/dispute | coordinator, poster | `{ quantity, reason }` → moves qty to disputed |
| POST | /confirmations/:id/resolve | admin | `{ toAccepted, toRejected, toLost … }` → recompute points |
| GET | /points/me | any | my ledger + total |
| GET | /impact/summary | any | confirmed orphanage total and street total (separate), disputed shown apart |

## M3-F Donation and waste history

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | /history | any approved | `?type, q, status, from, to`; only authorized records |
| POST | /waste-records | poster, coordinator | shortage / disposal; safety-rejected → disposal only |
| GET | /waste-records | poster, coordinator, admin | |
| POST | /corrections | poster, coordinator | quantity correction or destination change |
| GET | /corrections | requester, admin | `?status=` |
| POST | /corrections/:id/approve | admin (or listing poster for own listing) | guarded; applies + audits + recomputes points |
| POST | /corrections/:id/reject | admin | `{ note }` |
| GET | /surplus/:id/reconciliation | poster, coordinator, admin | equations + balanced flag per row |
