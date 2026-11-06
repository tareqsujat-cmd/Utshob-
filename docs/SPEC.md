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
- [x] Demo fault toggle: "Simulate Telegram outage" (stored in `appsettings`), used by M2-C

### C5. Cross-cutting
- [x] Audit log written for important changes (who, when, why, field diffs)
- [x] In-app notifications (bell icon, unread count, mark read)
- [~] Event cancel/reschedule notifies organizers and coordinators with reservations (M1-A, M1-C); booked providers are added by M3-C
- [~] `GET /api/meta`: divisions, districts, roles (units and categories are added by their features)
- [x] Central error handler, helmet, rate limiting, CORS, `.env.example`

---

## MODULE 1 (Lab 5)

### M1-A Event management: 22201813 (Tareq)
**Events**
- [x] Create event: title, type, start/end time, location (division, district, address, optional map pin), guest count, total budget, dietary requirements, required services (menu is edited on the Food plan tab)
- [x] List and search my previous events (title text, status, date range)
- [x] Edit event; edits to guest count / budget / location / dietary needs / services require a **reason** and appear in **requirement-change history** (menu changes too)
- [x] Copy a previous event into a new **draft** (no bookings/RSVPs/batches copied; banner: "Prices and availability may have changed")
- [~] Cancel (with reason) and reschedule (new date + reason): organizers notified; records preserved; cancelled/completed events read-only. Notifying booked providers / surplus coordinators and flagging bookings is added by M1-C and M3-C through `notifyEventParties`
- [x] Co-organizers: add/remove by email (limit by plan, backend-enforced)
- [x] Active-event limit by plan enforced on create/copy (402 + upgrade hint)

**Budget**
- [x] Budget breakdown per category: food, venue, decoration, transport, other (editable, with notes)
- [x] Every edit creates a new **version** (who, when, why, source: initial / manual / copy / ai / quote_approval); version history visible; stale edits rejected (409)
- [x] Budget scenarios (e.g. "Standard", "Lean"); count limited by plan; one is primary; side-by-side comparison
- [~] Summary compares budget total vs estimated vs approved quotes vs recorded expenses (expenses done via `committedCosts`; approved quotes come with M3-C)
- [x] Alerts: **over budget** (total, and per category vs quotes/expenses), **missing charges** (a required service with no budget line or quote), unallocated money

**Invitations and RSVP**
- [x] Customize invitation: heading, message, theme (palette/font/layout from a small set), RSVP deadline, publish toggle, live preview
- [x] Public invitation page `/invite/:slug` (no login) where guests submit RSVP: name, phone, yes/no/maybe, party size, dietary notes (rate-limited)
- [x] One RSVP per phone per event (re-submitting updates it, never duplicates; phone normalised)
- [x] Host sees RSVP list and totals (confirmed attendance)

**Food plan**
- [x] Menu items carry: unit (kg / portion / piece / litre), quantity per guest, and portions-per-unit conversion shown as **"≈ estimated"**
- [x] Cooking batches: planned -> started -> completed (or planned -> cancelled); invalid transitions refused
- [x] "Attendance changed" (expected, confirmed RSVPs or custom): system computes required vs (completed + started + planned) and **suggests** changes only to **planned** batches
- [x] Applying the suggestion uses an atomic guard (`status: 'planned', quantity: from`), so a batch that started meanwhile is skipped, never changed
- [x] Started/completed quantities are always preserved; units stay consistent with the menu item (unit change refused once batches exist)

### M1-B Provider management: 23201544 (Ridita)
- [x] Provider profile: business name, category (restaurant / caterer / venue / planner), description, address + map pin (Leaflet), service areas (divisions), capacity (min/max), outside catering allowed (venue), services/preference tags, setup and cleanup buffer hours (venue)
- [x] Packages: name, description, price per guest or flat price, min/max guests, included items (add / edit / archive, never deleted)
- [x] Availability: blocked dates with reason (bookings also block, see M3-C)
- [x] Upload credentials: type (trade licence, food safety certificate, fire safety, other), number, issue/expiry date, file (PDF/JPG/PNG, max 1 MB, stored in MongoDB)
- [x] Admin credential review queue: open file, approve/reject with note (guarded: reviewed once), reviewer and date recorded, audit + notification
- [x] **Bookable rule**: account approved + every required document approved and unexpired (venue: trade licence + fire safety; caterer/restaurant: trade licence + food safety; planner: trade licence). `assertBookable()` is ready for M3-C to refuse quote requests/bookings in the backend
- [x] Public provider page lists exactly which credentials were reviewed, when, and until when (masked number), plus the disclaimer that review is not a guarantee of food quality
- [~] Expired credential: new bookings blocked (rule compares dates every time) and provider warned once (lazy + "Run expiry check"). Flagging existing upcoming bookings `needsReview` is added to `runExpiryCheck` in M3-C, when bookings exist
- [x] Extra: provider directory for hosts (category, division, name filters) and provider dashboard cards

### M1-C Surplus food: 22301024 (Fiona)
- [x] Authorized posters (host for own event, approved provider) create listing: food type, quantity, unit, preparation time/method, packaging, reported storage condition, pickup location (map pin), pickup deadline, ingredients, allergens
- [x] **Missing-info flag** computed on save (allergens not declared, ingredients, preparation time, storage condition), shown as a badge and as a warning in matches
- [x] **Duplicate prevention**: same food + same pickup place (~100 m) + same day = same `dedupeKey` (partial unique index), so host and caterer cannot both list it; 409 says who listed it
- [x] Coordinators submit food request: quantity, unit, receiving capacity, collection capacity, availability windows, allergens to avoid
- [x] **Matching**: open listings in the same division ranked (district, distance, collection window vs deadline, covers need); allergen conflicts hidden; each match shows reasons, warnings and a suggested quantity with its limiting factor
- [x] **Split**: one listing can be reserved in parts by several organizations (becomes fully_reserved when nothing is left)
- [x] **Over-reservation blocked**: atomic `findOneAndUpdate` with an available-quantity `$expr` guard (tested with simultaneous requests)
- [x] Idempotency-Key on reservation (double click does not create two reservations)
- [x] **Expired listings closed** to new reservations (deadline in the guard + lazy close)
- [x] Cancel reservation releases uncollected quantity back to the listing (re-opens if before the deadline); event cancel/reschedule notifies coordinators with reservations

---

## MODULE 2 (Lab 6)

### Shared S1. Sandbox checkout (owner: 23201544 Ridita, built at the start of Module 2 because M2-A needs it)
- [x] `payments` collection with unique `tranId`
- [x] SSLCOMMERZ init -> redirect to gateway -> success/fail/cancel/IPN callbacks -> **backend validation API** check (status, tran_id, amount, currency) -> idempotent confirm -> side effect applied once (tested with a fake gateway)
- [x] Payment result page in the client with "Check status" (query by tran_id) fallback; 503 + disabled button with explanation when not configured; 502 + manual fallback when the gateway is down
- [ ] Real sandbox round trip verified (waiting for SSLCOMMERZ store credentials)

### M2-A Expenses and contributions: 22201813 (Tareq)
- [x] Record expenses (category, description, amount, paid by person/group, date); void with reason (no delete); feeds the budget summary ("spent", spent-over-estimate alert)
- [x] Cost groups (e.g. "Bride's family", "Groom's family") and split method: **equal** (all plans), **percentage / custom amounts** (Plus+, backend-gated 402)
- [x] Validation: percentages sum to 100, custom amounts sum to total expenses (warning if expenses change later)
- [x] Split summary per group: share, paid to vendors, contributed (received only), **outstanding** (or paid extra)
- [x] Contributions: cash, in-kind (description, quantity, unit, estimated value), sponsorship (sponsor, offer, promised benefits; Plus+)
- [x] **Pledged and received kept in separate fields** (also for goods: quantity vs receivedQuantity); status pledged -> partially received -> received / cancelled; receiving more than pledged refused (atomic guard)
- [~] Record manual cash/goods receipt (done), or **pay via shared sandbox checkout** (built + tested with a fake gateway; real sandbox run waits for credentials); payment applied to the contribution exactly once
- [x] Sponsorship fulfilment tracking (Pro+, backend-gated)

### M2-B Provider search (API: Nominatim): 23201544 (Ridita)
- [x] Location search box -> backend proxy to Nominatim (Bangladesh only, 6 s timeout, 24 h cache, 1 req/s throttle, identifying User-Agent, **search on submit, not autocomplete**); OSM names mapped to our divisions/districts
- [x] User picks a result, sees it on a Leaflet map, can **drag the pin to correct** it (reverse lookup) and confirm division/district in dropdowns
- [x] **Manual fallback**: division/district/address fields always available; visible notice when Nominatim fails or finds nothing
- [x] Criteria: date, guest count, per-category budgets, categories, required services, preferences; "fill from my event" (budget lines -> budgets)
- [x] Up to **10 providers per category**, only bookable ones; **"Why this matches"** reasons on each card
- [x] "Only N providers matched" note when fewer than 10, plus counts of hidden providers by reason
- [~] Review count + **"Limited history"** label (< 3 completed bookings). Labels work; real reviews/completed bookings arrive with M3-C
- [x] Venue capacity check (too small / minimum above guests) and outside-catering restriction (in-house-only venues flagged; caterers flagged after "Use as my venue")
- [x] Results on a Leaflet map (numbered, colour per category) + list; links to the provider profile (quote request comes with M3-C)

### M2-C Collection logistics (API: Telegram): 22301024 (Fiona)
- [x] Coordinator assigns a collector to a reservation: volunteer user or organization-arranged collector (name/phone), scheduled time
- [x] Only one active task per reservation (unique `activeKey`, tested with simultaneous assigns); Idempotency-Key on assign
- [x] Task statuses: assigned -> en route -> collected / partially collected; or delayed (minutes + reason), cancelled, missed; invalid transitions refused; volunteers can't cancel/miss
- [x] Partial collection records collected quantity and shortage; missed releases the uncollected quantity to the listing; cancelled frees the reservation for a new collector
- [~] Telegram linking: code -> `/start CODE` to the bot -> Verify (reads `getUpdates`). Built and tested with a fake Telegram; real run waits for the bot token
- [x] Assignment and status updates -> in-app notification **always**; Telegram message if connected
- [x] "Send due reminders" (button + daily Vercel Cron with secret); one reminder per task (claim + dedupe key)
- [x] Telegram failures logged per notification (status, attempts, error); **Retry** re-sends the same notification and never creates a new task
- [x] Dashboard task list works with Telegram down (admin "Simulate Telegram outage" switch, tested)

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
