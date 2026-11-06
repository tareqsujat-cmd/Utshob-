# Walkthrough: M1-C Surplus food
**Owner:** 22301024 (Mehreen Mallick Fiona) · **Module 1 / Lab 5**

## 1. What it does (plain language)
After (or during) an event, good untouched food can be shared.

- **Who posts:** a **host** (for one of their own events) or an approved **provider** (e.g. a caterer). A listing records food type, quantity + unit, preparation time and method, packaging, the storage condition *as reported*, pickup place (map pin), **pickup deadline**, ingredients and allergens.
- **Missing information is flagged:** allergens not declared, no ingredients, no preparation time, no storage condition. Coordinators see a "Missing: …" badge.
- **No duplicate listings:** the same food at the same pickup place on the same day can only be listed once. If the caterer already listed the leftovers, the host gets "already listed by … (provider)".
- **Requests:** orphanage and outreach coordinators post what they need: quantity, **receiving capacity** (how much they can accept), **collection capacity** (how much their collectors can carry), **time windows** when they can collect, and allergens to avoid.
- **Matching:** for a request, the system ranks open listings in the same division and explains why (same district, distance, can collect before the deadline, covers what you need), warns about missing information, **hides food with allergens the organization avoids**, and suggests a quantity = the smallest of what's left, what you still need, what you can receive, and what you can carry.
- **Reserving:** one listing can be **split** between organizations. **Two coordinators reserving at the same moment can never take more than exists** (one atomic database update). A double-click can't reserve twice (idempotency key).
- **Expiry:** after the pickup deadline the listing is **closed** to new reservations.
- **Cancelling** a reservation gives the uncollected quantity back, and the listing re-opens if it is still before the deadline.
- Cancelling or rescheduling an event notifies the coordinators holding reservations on its food.

## 2. File map
| File | Role |
|---|---|
| `server/models/SurplusListing.js` | Listing; separate `quantityTotal` / `quantityReserved` / `quantityWastedUnreserved`; **partial unique index on `dedupeKey`** |
| `server/models/FoodRequest.js` | What an organization needs + capacities + windows + allergens to avoid |
| `server/models/Reservation.js` | Part of a listing held for a request; **unique sparse `idempotencyKey`**; separate reserved/released/collected/shortage fields |
| `server/services/surplus.service.js` | `computeMissingInfo`, **`makeDedupeKey`**, `availableOf`, **`closeExpiredListings`**, **`reserveQuantity` (the guard)**, `releaseQuantity`, `refreshListingStatus`, `distanceKm`, **`matchListings`** |
| `server/validators/m1c.surplus.schemas.js` | zod: listing, listing update, request, reservation, reason, list filters |
| `server/controllers/m1c.surplus.controller.js` | Create (dedupe → 409), list open, my listings, detail, update (quantity guard), cancel |
| `server/controllers/m1c.requests.controller.js` | Requests CRUD, **matches**, **create reservation (idempotency + guard + rollback)**, list, **cancel reservation (release)** |
| `server/routes/m1c.surplus.routes.js` | `/api/surplus/*`, `/api/food-requests/*`, `/api/reservations/*` |
| `server/services/event.service.js → notifyEventParties` | Now also notifies coordinators with reservations on an event's food |
| `server/seed/data/surplus.js` | Engagement-dinner surplus (60 orphanage / 40 outreach), open listings around Dhaka (one with missing info, one with nuts, one expired), two requests |
| `server/tests/m1c.surplus.test.js` | 10 tests incl. **concurrent reservations** |
| `client/src/api/m1c.surplus.api.js` | Write calls + `newIdempotencyKey()` |
| `client/src/pages/m1c-surplus/SurplusFormPage.jsx` | Share surplus (event pick fills the pickup place) |
| `…/SurplusMinePage.jsx` | Poster's listings + who reserved |
| `…/SurplusBrowsePage.jsx` | Coordinators: open listings |
| `…/SurplusDetailPage.jsx` | Detail, map, reservations, **ReserveForm**, poster actions |
| `…/FoodRequestsPage.jsx` | Requests, reservations, new request, cancel |
| `…/MatchesPage.jsx` | Ranked matches with reasons and Reserve |
| `…/SurplusParts.jsx` | QuantityBar, DeadlineLabel, MissingInfo, AllergenPicker |

## 3. Request-to-database flow: reserving from a match
1. **MatchesPage → MatchCard**: the suggested quantity (60) is pre-filled. `key` = `crypto.randomUUID()` made when the card appeared.
2. Click **Reserve** → `surplusApi.reserve({ listingId, requestId, quantity }, key)` → `POST /api/reservations` with header **`Idempotency-Key: <key>`**.
3. Route: `requireAuth` → `requireRole(coordinators)` → `requireApproved` → `validate(reservationSchema)`.
4. **`createReservation`**:
   1. Is there already a reservation with this key? → return it (200). *(Double-click or network retry.)*
   2. Load the request (must be my organization's and still open), and the listing. Check unit, capacity and "still needed".
   3. **`reserveQuantity(listingId, 60)`**: one `findOneAndUpdate` whose **filter** says "open, before deadline, and total − reserved − wasted ≥ 60" and whose **update** is `$inc quantityReserved: 60`. If the filter doesn't match → `null` → 409 "Only X left".
   4. `Reservation.create(...)` with the key. If that fails, **undo** the `$inc` so no food is lost.
   5. `refreshListingStatus` (open → fully_reserved when nothing is left); `$inc` the request's `quantityMatched`; refresh its status.
5. **MongoDB**: listing updated atomically, reservation inserted. `logAudit` + a notification to the poster.
6. Response `201 { reservation }` → "Reserved 60 portion." → the page reloads.

## 4. Key code, explained

### a) The over-reservation guard (`surplus.service.js → reserveQuantity`)
```js
return SurplusListing.findOneAndUpdate(
  {
    _id: listingId,
    status: 'open',
    pickupDeadline: { $gt: now },                     // expired listings can't be reserved
    $expr: {                                          // compare fields of the SAME document:
      $gte: [ { $subtract: ['$quantityTotal', { $add: ['$quantityReserved', '$quantityWastedUnreserved'] }] },
              quantity ],                             //   available >= requested ?
    },
  },
  { $inc: { quantityReserved: quantity } },           // take it
  { returnDocument: 'after' }
);
```
Check + change are **one** operation on **one** document, which MongoDB applies atomically. With 100 portions and three requests of 40 at the same instant, MongoDB applies them one after another: 100→60 left, 60→20 left, then the third finds only 20, so its filter fails → `null` → 409 "Only 20 portion left". The test `CONCURRENT reservations can never exceed the stock` proves it with `Promise.all`.
**Why not "read, check in JS, then save"?** Between the read and the save another request could reserve the same food (a race condition), and both would succeed.

### b) Duplicate prevention (`makeDedupeKey` + partial unique index)
```js
const place = loc.lat && loc.lng ? `${loc.lat.toFixed(3)},${loc.lng.toFixed(3)}`   // ~100 m
                                 : `${loc.district}:${normalizeFood(loc.address)}`;
return `${dhakaDay(listing.pickupDeadline)}|${place}|${normalizeFood(listing.foodType)}`;
// "2026-11-06|23.746,90.374|firnicups"
```
```js
surplusListingSchema.index({ dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } });
```
The host at the venue and the caterer at the same venue produce the **same key**, so the database itself refuses the second insert (error 11000), and we turn that into a friendly 409. When a listing is closed or cancelled we `$unset` the key, which releases the "lock" (the partial index ignores documents without it).

### c) Idempotency (`createReservation`)
```js
const key = req.get('Idempotency-Key');
if (key) {
  const previous = await Reservation.findOne({ idempotencyKey: key });
  if (previous) return res.status(200).json({ reservation: previous, repeated: true });
}
```
The browser makes one key per attempt. If the same request arrives twice, the second gets the first result back. If two copies race past this check, the unique index on `idempotencyKey` makes the second `create` fail, and we undo its quantity and return the first.

### d) Lazy expiry (`closeExpiredListings`)
```js
SurplusListing.updateMany(
  { status: { $in: ['open', 'fully_reserved'] }, pickupDeadline: { $lte: now } },
  { $set: { status: 'closed' }, $unset: { dedupeKey: 1 } });
```
It runs at the start of the list/detail/matches endpoints. Correctness doesn't depend on it, because the reservation guard checks the deadline itself.

### e) Suggested quantity (`matchListings`)
```js
const limits = [
  { value: available, why: 'what is left' },
  { value: stillNeeded, why: 'what you still need' },
  { value: request.receivingCapacity, why: 'your receiving capacity' },
  { value: request.collectionCapacity, why: 'your collection capacity' },
];
const smallest = limits.reduce((min, l) => (l.value < min.value ? l : min));
```
The UI shows both the number and *why* ("Limited by your collection capacity").

## 5. Likely viva questions
1. **What stops two coordinators from reserving more food than exists?** The atomic guarded `findOneAndUpdate` in `reserveQuantity`: the "enough left?" check is inside the filter, so check and update can't be separated.
2. **Why `$expr`?** A normal filter compares a field with a constant; `$expr` lets us compute with the document's *own* fields (total − reserved − wasted).
3. **How do you prevent the host and the caterer listing the same food?** Same day + same place (pin rounded ~100 m) + same food → same `dedupeKey`, which has a unique index.
4. **Why a *partial* unique index?** So only active listings hold the key. Closed/cancelled ones `$unset` it and stop blocking.
5. **What happens on a double-click on Reserve?** Same `Idempotency-Key` → the server returns the existing reservation (200) instead of making another.
6. **How do expired listings get closed with no scheduled job?** Lazily when listings are read, and the reservation guard refuses expired ones anyway.
7. **How is a listing split between two organizations?** Each reservation takes part of it; the listing keeps `quantityReserved` as the sum, and becomes `fully_reserved` when nothing is left.
8. **What happens when a reservation is cancelled?** `quantityReleased` is recorded, the listing's `quantityReserved` goes down (`releaseQuantity`), and the listing re-opens if it is still before the deadline.
9. **Why are allergen conflicts hidden instead of shown with a warning?** Safety: an orphanage that avoids nuts should never be offered nut dessert. Undeclared allergens are shown with a warning.
10. **Why keep several quantity fields instead of one?** Reserved, released, collected, shortage and wasted mean different things; mixing them would double count. M3-F checks they always balance.

## 6. Live-modification drills

**Drill 1: Only match listings within 10 km.**
In `matchListings`, after computing `km`: `if (km !== null && km > 10) continue;`

**Drill 2: Add "halal" as a field on listings and show it.**
1. `SurplusListing.js`: `isHalal: { type: Boolean, default: false },`
2. `m1c.surplus.schemas.js` → `listingDetails`: `isHalal: z.boolean().default(false),`
3. `SurplusFormPage.jsx`: add `isHalal: false` to the state and `<Checkbox label="Halal" checked={form.isHalal} onChange={(e) => update({ isHalal: e.target.checked })} />`
4. `SurplusDetailPage.jsx`: `{listing.isHalal && <Badge tone="success">Halal</Badge>}`

**Drill 3: Refuse reservations smaller than 5 portions.**
`m1c.surplus.schemas.js → reservationSchema`: `quantity: z.coerce.number().min(5, 'Reserve at least 5')`. The message appears in the Reserve form's alert.

## 7. 60-second demo script
1. Log in as **Orphanage coordinator** (`orphanage@utshob.demo` / `Demo@1234`) → **Food requests** → "Dinner for 80 children" → **Find matches**.
2. Show: "1 listing hidden because it contains allergens you avoid" (nut firni), the reasons, the missing-info warning on "Dal and rice", and the suggested 60 ("limited by your collection capacity") → **Reserve**.
3. Log in as **Outreach coordinator** → **Available surplus** → Vegetable khichuri → reserve **30** → refused: **"Only 20 portion left"** (the guard) → reserve **20** → **split** between two organizations, now fully reserved.
4. Log in as **host** → **My surplus → Share surplus** → event "Wedding reception", food "Firni cups" at the venue, same day → **"already listed by Kamal Uddin (provider)"** (dedupe).
5. Back as orphanage → cancel the reservation → "went back to the listing" (the listing is open again).
6. Mention the automated test that fires three reservations at the same instant: exactly one is refused.
