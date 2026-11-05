# UTSHOB: Feature Specification and Checklist

Tick a box only after the item has been **run and seen working**. "Shared" items are infrastructure that more than one feature needs. Each of those is assigned to an owner so commit history stays clear.

Legend: `[ ]` not started · `[~]` partial · `[x]` done and verified

Roles: `host` · `provider` · `orphanage_coordinator` · `outreach_coordinator` · `volunteer` · `admin`

---

## Common workflows (not graded, so build simply and early)

### C1. Auth and accounts
- [x] Sign up with name, email, password, role, division/district, phone
- [x] Host and volunteer accounts are active immediately; provider and coordinator accounts start `pending`
- [x] Login returns JWT; logout clears it client-side (and writes an audit entry)
- [x] `GET /api/auth/me` restores the session on reload
- [x] Pending users can log in but see a "waiting for approval" banner (`requireApproved` returns 403 on operational routes as they are added)

### C2. Roles, dashboards, permissions
- [~] Role-based sidebar and a dashboard home per role (reads real counts from the API). The admin dashboard is complete; other roles gain cards as their features land
- [x] Backend `requireRole` on every route, plus record-level checks (owner / organizer / assigned / same organization), applied to each feature's routes as they are built
- [x] Admin can read everything

### C3. Profile
- [x] View/edit own profile (name, phone, division, district)
- [x] Change password
- [x] Coordinators: create (at signup) and view/edit their organization (orphanage or outreach). It needs admin approval.

### C4. Admin
- [x] Approval queue: provider accounts and community organizations (approve/reject with reason)
- [x] Audit log viewer (who / what / when / why, filter by entity type and action)
- [x] "Reset demo" button (re-runs the seed)
- [~] Demo fault toggle: "Simulate Telegram outage" (stored in `appsettings`). The switch works; its effect is wired in M2-C

### C5. Cross-cutting
- [x] Audit log written for important changes (who, when, why, field diffs)
- [x] In-app notifications (bell icon, unread count, mark read)
- [ ] Event cancel/reschedule notifies organizers, booked providers and surplus coordinators (M1-A)
- [~] `GET /api/meta`: divisions, districts, roles (units and categories are added by their features)
- [x] Central error handler, helmet, rate limiting, CORS, `.env.example`

---

## MODULE 1 (Lab 5)

### M1-A Event management: 22201813 (Tareq)
**Events**
- [ ] Create event: title, type, start/end time, location (division, district, address), guest count, total budget, menu items, dietary requirements, required services
- [ ] List and search my previous events (title text, status, date range)
- [ ] Edit event; edits to guest count / budget / date / menu require a **reason** and appear in **requirement-change history**
- [ ] Copy a previous event into a new **draft** (no bookings/RSVPs copied; banner: "Prices and availability may have changed")
- [ ] Cancel (with reason) and reschedule (new date + reason) → notifications sent; bookings flagged for availability recheck; food/donation records preserved
- [ ] Co-organizers: add/remove organizers (limit by plan, backend-enforced)
- [ ] Active-event limit by plan enforced on create/copy

**Budget**
- [ ] Budget breakdown per category: food, venue, decoration, transport, other (editable)
- [ ] Every edit creates a new **version** (who, when, why, source: manual / AI / quote approval); version history visible
- [ ] Budget scenarios (e.g. "Standard", "Lean"); count limited by plan; one is primary
- [ ] Summary compares: budget total vs estimated vs approved quotes vs recorded expenses
- [ ] Alerts: **over budget** (total and per category), **missing charges** (a required service with no budget line or no quote)

**Invitations and RSVP**
- [ ] Customize invitation: heading, message, theme (palette/font/layout from a small set), RSVP deadline, publish toggle
- [ ] Public invitation page `/invite/:slug` (no login) where guests submit RSVP: name, phone, yes/no/maybe, party size, dietary notes
- [ ] One RSVP per phone per event (re-submitting updates it, never duplicates)
- [ ] Host sees RSVP list and totals (confirmed attendance)

**Food plan**
- [ ] Menu items carry: unit (kg / portion / piece / litre), portion per guest, and portions-per-unit conversion flagged **"≈ estimated"**
- [ ] Cooking batches: planned → started → completed (or cancelled)
- [ ] "Attendance changed" → system computes required vs (completed + started + planned) and **suggests** changes only to **planned** batches
- [ ] Applying the suggestion uses an atomic guard (`status: 'planned'`), so a batch that started meanwhile is never changed
- [ ] Started/completed quantities are always preserved; units stay consistent with the menu item

### M1-B Provider management: 23201544 (Ridita)
- [ ] Provider profile: business name, category (restaurant / caterer / venue / planner), description, address + map point, service areas (divisions/districts), capacity (venue min/max), outside catering allowed (venue), services/cuisine tags, setup and cleanup buffer hours (venue)
- [ ] Packages: name, description, price per guest or flat price, min/max guests, included items (add / edit / archive)
- [ ] Availability: blocked dates with reason (bookings also block, see M3-C)
- [ ] Upload credentials: type (trade licence, food safety certificate, fire safety, other), number, expiry date, file (PDF/JPG/PNG, max 1 MB)
- [ ] Admin credential review queue: view file, approve/reject with note, reviewer and date recorded
- [ ] **Bookable rule**: account approved + approved, unexpired trade licence (+ food safety certificate for caterer/restaurant). If not bookable, quote requests and bookings are refused in the backend
- [ ] Public provider page lists exactly which credentials were reviewed, by whom and when, plus the disclaimer "Credential review is not a guarantee of food quality"
- [ ] Expired credential: new bookings blocked; existing upcoming bookings are flagged `needsReview` (lazy check + admin "run expiry check")

### M1-C Surplus food: 22301024 (Fiona)
- [ ] Authorized posters (host for own event, approved caterer/restaurant) create listing: food type, quantity, unit, preparation time/method, packaging, reported storage condition, pickup location, pickup deadline, ingredients, allergens
- [ ] **Missing-info flag** computed on save (e.g. "allergens not declared"), shown as a badge
- [ ] **Duplicate prevention**: host and caterer cannot both list the same surplus for the same event (unique `dedupeKey`) → 409 with who listed it
- [ ] Coordinators submit food request: food wanted, quantity, unit, receiving capacity, collection capacity, availability windows, dietary restrictions
- [ ] **Matching**: open listings ranked for a request (same division/district, distance, deadline vs availability window, allergens vs restrictions, quantity fit); each match shows reasons and a suggested quantity
- [ ] **Split**: one listing can be reserved in parts by several organizations
- [ ] **Over-reservation blocked**: atomic `findOneAndUpdate` with an available-quantity guard (two simultaneous requests cannot exceed stock)
- [ ] Idempotency-Key on reservation (double click does not create two reservations)
- [ ] **Expired listings closed** to new reservations (deadline in the guard + lazy close)
- [ ] Cancel reservation releases uncollected quantity back to the listing (if not expired)

---

## MODULE 2 (Lab 6)

### Shared S1. Sandbox checkout (owner: 23201544 Ridita, built at the start of Module 2 because M2-A needs it)
- [ ] `payments` collection with unique `tranId`
- [ ] SSLCOMMERZ init → redirect to gateway → success/fail/cancel callbacks → **backend validation API** check (amount, currency, status) → idempotent confirm → side effect applied once
- [ ] Payment status page in the client; fallback message if gateway unreachable

### M2-A Expenses and contributions: 22201813 (Tareq)
- [ ] Record expenses (category, description, amount, paid by, date, optional booking link); void with reason (no delete)
- [ ] Cost groups (e.g. "Bride's family", "Groom's family") and split method: **equal** (all plans), **percentage / custom amounts** (Plus+, backend-gated)
- [ ] Validation: percentages sum to 100, custom amounts sum to total
- [ ] Split summary per group: share owed, received, **outstanding**
- [ ] Contributions: cash, in-kind (description, quantity, unit, estimated value), sponsorship (sponsor, offer, promised benefits; Plus+)
- [ ] **Pledged and received kept in separate fields**; status pledged → partially received → received / cancelled
- [ ] Record manual cash receipt, or **pay via shared sandbox checkout** (S1); payment applied to the contribution exactly once
- [ ] Sponsorship fulfilment tracking (Pro+)

### M2-B Provider search (API: Nominatim): 23201544 (Ridita)
- [ ] Location search box → backend proxy to Nominatim (Bangladesh only, timeout, cache, proper User-Agent, **search on submit, not autocomplete**, per usage policy)
- [ ] User picks a result, sees it on a Leaflet map, can **drag the pin to correct** it and confirm
- [ ] **Manual fallback**: division/district/address form when Nominatim fails or has no result (visible message)
- [ ] Criteria: date, guest count, budget, categories, services, preferences (e.g. halal, vegetarian options)
- [ ] Up to **10 providers per category**, only bookable ones; **"Why this matches"** reasons on each card
- [ ] "Only N providers matched" message when fewer than 10
- [ ] Review count + **"Limited history"** label (fewer than 3 completed bookings)
- [ ] Venue capacity check (guest count vs capacity) and outside-catering restriction (if the chosen venue forbids outside catering, caterer results are flagged)
- [ ] Results on a Leaflet map + list; "Request quote" from a card (links to M3-C)

### M2-C Collection logistics (API: Telegram): 22301024 (Fiona)
- [ ] Coordinator assigns a collector to a reservation: volunteer user or organization-arranged collector (name/phone), scheduled time
- [ ] Only one active task per reservation (unique `activeKey`); Idempotency-Key on assign
- [ ] Task statuses: assigned → en route → collected / partially collected; or delayed (minutes + reason), cancelled, missed
- [ ] Partial collection records collected quantity and shortage; cancelled/missed release the uncollected quantity
- [ ] Telegram linking: user gets a code, sends `/start CODE` to the bot, clicks Verify (backend reads `getUpdates`)
- [ ] Assignment and status updates → in-app notification **always**; Telegram message if subscribed
- [ ] "Send due reminders" (button + cron endpoint with secret); one reminder per task schedule (dedupe key)
- [ ] Telegram failures logged (status, attempts, error); **Retry** re-sends the same notification and never creates a new task
- [ ] Dashboard task list works with Telegram down (demo: admin "Simulate Telegram outage" toggle)

---

## MODULE 3 (Lab 7)

### M3-A AI assistant (API: Gemini): 22201813 (Tareq)
- [ ] Three suggestion types for an event: **budget options comparison**, **food-planning improvement**, **invitation wording + template design**
- [ ] Gemini called from backend with timeout; JSON-schema output; result stored as a suggestion
- [ ] Output labelled **"Estimate"**; unconfirmed prices marked as estimates
- [ ] Explicit **Approve / Reject**; approve applies the change (new budget version or scenario / menu or planned-batch update / invitation), reject records the decision
- [ ] **Monthly quota** per plan via atomic counter; refunded when the API call fails
- [ ] **Manual fallback**: on failure, the UI shows the error and opens the manual editor

### M3-B Event reports: 22201813 (Tareq)
- [ ] Report per event: expenses by category, budget vs actual, confirmed (received) contributions vs pledged, outstanding balances per cost group
- [ ] Food outcomes: prepared (completed batches), surplus listed, **orphanage accepted** and **street distributed** shown separately, remaining, wasted, disputed (excluded from confirmed)
- [ ] Recognition of confirmed contributions: one point entry per contribution (unique index, **no duplicate rewards**)
- [ ] On-screen report (all plans); downloadable CSV (Plus+); detailed finance/impact section (Pro+); consolidated multi-event/branch report (Enterprise)

### M3-C Quotations and bookings: 23201544 (Ridita)
- [ ] Customer requests itemized quote from a bookable provider for an event
- [ ] Provider submits quote (items, qty, unit price, VAT/service charge, validity); each revision is a **new version**
- [ ] Customer compares quotes side by side (per category) and requests a revision or approves/rejects
- [ ] Approval recorded (who/when) and the event budget updated **only after approval** (new budget version, source "quote approval")
- [ ] Book from approved quote; venue and other providers confirmed separately
- [ ] **Venue overlap prevented**, including setup and cleanup buffers (hour slots with unique index); conflict shown in UI
- [ ] Sandbox booking **deposit** via S1; booking confirmed once deposit verified
- [ ] Cancel (customer or provider) with reason; **cancellation and approval history** on the booking
- [ ] Provider cancels → customer notified + **alternative providers suggested** (reuses M2-B matching); replacement needs customer action
- [ ] Provider marks completed after event; customer leaves **one review per completed booking**; provider can respond
- [ ] Searchable quote/booking history

### M3-D Subscriptions (API: SSLCOMMERZ sandbox): 23201544 (Ridita)
- [ ] Plans page reads from `plans` collection (prices, limits, features)
- [ ] Choose plan → sandbox payment (S1) → backend verification → subscription active for 30 days
- [ ] Current plan + usage page (active events, AI requests this month, scenarios)
- [ ] **Limit enforcement in backend**: active events, organizers per event, AI requests/month, budget scenarios per event, branches
- [ ] **Feature gates**: Plus+: custom/percentage splits, sponsorship offers, reminders, reusable templates, downloadable reports · Pro+: sponsorship fulfilment tracking, assigned approvers, detailed reports · Enterprise: org-wide summaries, team approvals, consolidated reports, up to 3 branches
- [ ] **Expiry**: falls back to Starter automatically (lazy); existing records remain readable, never deleted; over-limit items become read-only

### M3-E Delivery confirmation: 22301024 (Fiona)
- [ ] Orphanage coordinator confirms a collected task: received, accepted, rejected for safety, rejected other, lost in transit
- [ ] Outreach coordinator records aggregate street distribution: distributed and remaining (**no recipient accounts, no photos**)
- [ ] Equations validated: orphanage `collected = accepted + rejectedSafety + rejectedOther + lost + disputed`; outreach `collected = distributed + remaining + lost + disputed`
- [ ] Partial acceptance, remaining food and disputes tracked in separate fields
- [ ] Dispute a quantity (open → resolved by admin); **disputed quantities excluded** from confirmed totals
- [ ] **Contribution points once per confirmed action** (unique ledger entry); **corrected** (not duplicated) when records change

### M3-F Donation and waste history: 22301024 (Fiona)
- [ ] Search history (listings, reservations, tasks, confirmations, waste, disputes) limited to what the user may see
- [ ] Record shortages (less food than listed) and disposal (reason + method)
- [ ] Request a reviewed **correction** (quantity fix) or **destination change** (move non-safety food to another request); reviewer approves/rejects; changes applied atomically + audited + points recomputed
- [ ] **Reconciliation view**: per listing, totals balance (see equations in DATA_MODEL); unbalanced rows highlighted
- [ ] **Food rejected for safety is never auto-reassigned** (only disposal allowed; destination-change refused)

---

## Demo quality checklist
- [ ] `npm run seed`: all 8 divisions, demo account per role, the "Wedding reception, 200 guests, ৳150,000, Dhaka" event with approved quotes ৳120,000, 2 of 3 providers confirmed, previous-event surplus 60 orphanage / 30 street / 10 awaiting
- [ ] Admin "reset demo" restores it
- [ ] Visible hard logic: over-budget warning · venue overlap conflict · AI Estimate + approve · split reservation · concurrent over-reservation blocked · disputed excluded · Telegram fail → retry → dashboard
- [ ] Tests: permissions, overlapping bookings, concurrent reservations, idempotent payments/points/retries, reconciliation, plan limits
- [ ] `docs/DEMO_SCRIPT.md` (5–7 min golden path + backup path) and a 60-second script per feature
- [ ] README: overview, architecture diagram, setup, env vars, seed, tests, deploy, decisions, feature → files/routes table
- [ ] Deployed on Vercel and public URL verified
