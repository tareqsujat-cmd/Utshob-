# UTSHOB: Data Model (MongoDB + Mongoose)

All collections get `createdAt` / `updatedAt` via `{ timestamps: true }`. `ref` means an ObjectId pointing at another collection.
Money is stored as a plain Number in **BDT (whole taka)**. Quantities are Numbers with a `unit` next to them.

The patterns used below are explained in `docs/GLOSSARY.md`:
- **Guarded update**: `findOneAndUpdate` with a condition. `null` means somebody else got there first.
- **Unique index as a lock**: the database refuses a second document with the same key.
- **activeKey / dedupeKey**: a field that is set only while a record is "active" and has a unique partial index. Unset it to release the lock.
- **idempotencyKey**: UUID sent by the client per submit, unique so that repeats return the same record.

Owner column = feature whose member builds the model.

---

## Common

### users (Common)
| Field | Type | Notes |
|---|---|---|
| name | String, required | |
| email | String, required, lowercase | **unique index** |
| passwordHash | String | bcrypt; never returned (`select: false`) |
| role | enum | host, provider, orphanage_coordinator, outreach_coordinator, volunteer, admin |
| phone, division, district | String | division ∈ 8 divisions |
| approvalStatus | enum | pending / approved / rejected (host, volunteer, admin start approved) |
| approvalNote | String | reason when rejected |
| organization | ref organizations | coordinators only |
| telegram | { chatId, linkCode, linkCodeExpiresAt, linkedAt } | M2-C |
| branches | [{ name, division }] | Enterprise only, max 3 (M3-D) |

### organizations (Common: community orgs)
name, type (orphanage / outreach), division, district, address, location {lat, lng}, contactPhone, defaultReceivingCapacity, coordinators [ref users], approvalStatus, approvedBy, approvedAt.
Index: `{ type: 1, division: 1 }`.

### auditlogs (Common)
actor (ref users), actorRole, action (e.g. `event.update`, `booking.cancel`), entityType, entityId, changes [{ field, from, to }], reason, at.
Index: `{ entityType: 1, entityId: 1, at: -1 }`. Write-only (never edited).

### notifications (Common + M2-C): in-app notification *and* its Telegram delivery state
| Field | Notes |
|---|---|
| user | ref users |
| type | `event.cancelled`, `task.assigned`, `task.reminder`, `booking.provider_cancelled` … |
| title, body, link | shown in the bell menu |
| readAt | Date or null |
| relatedTask | ref collectiontasks (optional) |
| telegram | { status: skipped / pending / sent / failed, attempts, lastError, lastAttemptAt, sentAt } |
| dedupeKey | e.g. `reminder:<taskId>:<scheduledAt>`, **unique sparse**, so the same reminder is never created twice |

The in-app notification is always created first, which is why the dashboard still works if Telegram fails. Retry re-sends **this** document, so it can never duplicate a task.

### appsettings (Common)
key (**unique**), value (Mixed). Used for `telegramFaultInjection` (demo toggle).

### files (M1-B)
owner, filename, mimeType (pdf/png/jpeg), size (≤ 1 MB), data (Buffer). Served only to owner and admin.

---

## Module 1

### events (M1-A)
| Field | Notes |
|---|---|
| owner | ref users (host) |
| organizers | [ref users]; owner + co-organizers; length ≤ plan.limits.organizers |
| title, eventType | eventType: wedding, birthday, corporate, religious, community, other |
| startsAt, endsAt | Date |
| location | { division, district, address, displayName, lat, lng, source: nominatim / manual } |
| guestCount | Number (expected) |
| budgetTotal | Number (BDT) |
| menu | [{ _id, name, course, unit (kg/portion/piece/litre), portionPerGuest, portionsPerUnit, conversionIsEstimate: Boolean }] |
| dietary | [{ label (vegetarian, halal, nut-free, diabetic …), guestCount }] |
| requiredServices | [venue, catering, decoration, planner, transport] |
| status | draft / planned / cancelled / completed |
| cancelReason | String |
| copiedFrom | ref events |
| branch | String (Enterprise) |
| invitation | { slug, heading, message, theme: { palette, font, layout }, rsvpDeadline, isPublished } |
| costSplit | { method: equal / percentage / custom, groups: [{ name, percentage, fixedAmount }] } (M2-A) |

Indexes: `{ owner: 1, startsAt: -1 }`, `{ organizers: 1 }`, `{ 'invitation.slug': 1 }` **unique, partial (slug exists)**.
"Active event" (for plan limit) = status ∈ {draft, planned}.
Requirement-change history = `auditlogs` where entityType = 'event'.

### budgets (M1-A): one document per scenario, versions embedded
| Field | Notes |
|---|---|
| event | ref events |
| name | "Standard", "Lean" … |
| isPrimary | Boolean (exactly one per event) |
| version | current version number |
| lines | [{ category: food/venue/decoration/transport/other, estimated, note }] |
| versions | [{ version, lines, total, changedBy, reason, source: manual / ai / quote_approval, at }] |

Index: `{ event: 1, name: 1 }` **unique**. Scenario count per event ≤ plan.limits.budgetScenarios.
Update rule: push the old state into `versions`, `$inc version`, guarded by `{ _id, version: <the version the user edited> }`, so two people editing at once cannot silently overwrite each other (optimistic concurrency).

### rsvps (M1-A)
event, guestName, contact (normalized phone), response (yes / no / maybe), partySize, dietaryNotes, respondedAt.
Index: `{ event: 1, contact: 1 }` **unique** → upsert, never duplicates.
Confirmed attendance = Σ partySize where response = yes.

### cookingbatches (M1-A)
event, menuItemId, menuItemName, quantity, unit (must equal the menu item's unit), estimatedPortions, status (planned / started / completed / cancelled), startedAt, completedAt, note, createdBy.
Index: `{ event: 1, status: 1 }`.
Adjustment rule: only `updateOne({ _id, status: 'planned' }, …)`. If the batch already started, the update matches nothing and it is reported back as "skipped: already started".

### providerprofiles (M1-B)
| Field | Notes |
|---|---|
| user | ref users, **unique** |
| businessName, category | category: restaurant / caterer / venue / planner |
| description, address, division, district, location {lat, lng} | |
| serviceAreas | [{ division, district }] (district optional = whole division) |
| capacity | { min, max } (venue) |
| allowsOutsideCatering | Boolean (venue) |
| tags | services/cuisine/preferences: halal, vegetarian-options, decoration, AC hall … |
| setupBufferHours, cleanupBufferHours | venue, default 2 / 2 |
| packages | [{ _id, name, description, pricingType: per_guest / flat, price, minGuests, maxGuests, items [String], isArchived }] |
| blockedDates | [{ date, reason }] |
| reviewCount, ratingAvg, completedBookings | denormalized counters updated on review/completion |

Indexes: `{ category: 1, 'serviceAreas.division': 1 }`.
**Bookable** (computed by `provider.service.evaluateBookability`): user approved AND every document in `REQUIRED_CREDENTIALS[category]` approved and unexpired: venue = trade licence + fire safety, caterer/restaurant = trade licence + food safety, planner = trade licence.

### credentials (M1-B)
provider (ref providerprofiles), type (trade_licence / food_safety / fire_safety / other), number, issuedAt, expiresAt, file (ref files), status (pending / approved / rejected), reviewedBy, reviewedAt, reviewNote, expiryNotifiedAt (set once by the expiry check; claimed atomically).
Index: `{ provider: 1, type: 1 }`, `{ status: 1 }`.
An expired approved credential stays `approved` (history preserved); "valid" = approved AND expiresAt > now.

### surpluslistings (M1-C)
| Field | Notes |
|---|---|
| postedBy, postedByRole | host or provider |
| event | ref events (optional) |
| provider | ref providerprofiles (when caterer posts) |
| foodType, description | |
| unit | portion / kg / piece / litre |
| quantityTotal | as posted |
| quantityReserved | held by non-released reservations |
| quantityWastedUnreserved | shortage/disposal recorded before reservation |
| preparation | { preparedAt, method } |
| packaging, storageCondition | reported by poster |
| pickupLocation | { address, division, district, lat, lng } |
| pickupDeadline | Date |
| ingredients, allergens | [String] |
| missingInfo | [String] computed on save, e.g. ['allergens', 'preparedAt'] |
| status | open / fully_reserved / closed / cancelled / completed |
| dedupeKey | `<eventId>:<normalized foodType>:<pickup date>`, or `<postedBy>:<foodType>:<date>` without event. **Unique partial (exists)**, unset when closed/cancelled |

Indexes: `{ status: 1, 'pickupLocation.division': 1, pickupDeadline: 1 }`, dedupeKey unique partial.
**Reservation guard** (the key line of M1-C):
```js
SurplusListing.findOneAndUpdate(
  { _id, status: 'open', pickupDeadline: { $gt: now },
    $expr: { $gte: [ { $subtract: ['$quantityTotal', { $add: ['$quantityReserved', '$quantityWastedUnreserved'] }] }, qty ] } },
  { $inc: { quantityReserved: qty } }, { returnDocument: 'after' })
```

### foodrequests (M1-C)
organization, coordinator, orgType (orphanage / outreach), foodTypesWanted [String], quantityNeeded, unit, receivingCapacity, collectionCapacity, availability [{ from, to }], dietaryRestrictions [String] (allergens to avoid), division, district, location, status (open / partially_matched / fulfilled / cancelled), quantityMatched.

### reservations (M1-C)
listing, request, organization, coordinator, unit,
**quantityReserved**, **quantityReleased** (returned on cancel/missed), **quantityCollected**, **quantityShortage** (not there at pickup),
status (reserved / task_assigned / collected / partially_collected / cancelled / missed / closed), idempotencyKey (**unique sparse**), history [{ action, by, at, note }].
Index: `{ listing: 1 }`, `{ organization: 1, status: 1 }`.

---

## Module 2

### payments (Shared S1, owner M3-D)
| Field | Notes |
|---|---|
| tranId | our transaction id, **unique** (the idempotency key for the gateway) |
| purpose | subscription / contribution / booking_deposit |
| refId | id of the subscription / contribution / booking |
| user | payer |
| amount, currency | BDT |
| status | initiated / paid / failed / cancelled |
| valId, gatewayStatus, cardType, bankTranId | from SSLCOMMERZ validation API |
| verifiedAt, appliedAt | appliedAt set when the side effect has been applied |

Confirm rule: `findOneAndUpdate({ tranId, status: 'initiated' }, { status: 'paid', … })`. Only the first callback wins. Side effect guarded again (see contributions/bookings/subscriptions).

### expenses (M2-A)
event, category, description, amount, paidByName, paidByGroup, date, booking (optional), status (recorded / void), voidReason, createdBy.
Index: `{ event: 1, status: 1 }`.

### contributions (M2-A)
| Field | Notes |
|---|---|
| event, contributorName, contributorUser (optional), group | |
| type | cash / in_kind / sponsorship |
| amountPledged | promise |
| amountReceived | money actually received (never mixed with pledged) |
| inKind | { description, quantity, unit, estimatedValue, receivedQuantity } |
| sponsorship | { sponsorName, offer, benefitsPromised, fulfilmentStatus: not_started / in_progress / fulfilled, fulfilmentNotes } |
| status | pledged / partially_received / received / cancelled |
| receipts | [{ amount, method: manual_cash / sandbox, payment, at, recordedBy }] |
| appliedPayments | [ref payments], the guard: `$inc` only if `appliedPayments: { $ne: paymentId }` |

### collectiontasks (M2-C)
reservation, organization, assignedBy,
collector { type: volunteer / org_arranged, user, name, phone },
scheduledAt, windowEnd, status (assigned / en_route / collected / partially_collected / delayed / cancelled / missed),
quantityCollected, delay { minutes, reason }, cancelReason, reminderSentAt, history [{ status, by, at, note }],
**activeKey** (= reservation id while task active; **unique partial**), idempotencyKey (**unique sparse**).
Index: `{ 'collector.user': 1, status: 1 }`, `{ organization: 1, scheduledAt: 1 }`.

(Telegram delivery state lives in `notifications`, see Common.)

---

## Module 3

### plans (M3-D), seeded, read by everyone
code (**unique**: starter / plus / pro / enterprise), name, priceUsd, priceBdt, sortOrder,
limits { activeEvents, organizers, aiRequestsPerMonth, budgetScenarios, branches },
features { customSplits, sponsorshipOffers, reminders, templates, downloadableReports, sponsorshipTracking, assignedApprovers, detailedReports, orgSummaries, teamApprovals, consolidatedReports }.

### subscriptions (M3-D)
user, planCode, status (pending_payment / active / expired / cancelled), startsAt, endsAt (start + 30 days), payment (ref payments, **unique sparse**).
Effective plan = newest `active` subscription with `endsAt > now`, else `starter`. Expiry is lazy; nothing is deleted.

### usagecounters (M3-A / M3-D)
user, month ('2026-11'), aiRequests. Index `{ user: 1, month: 1 }` **unique**.
Quota guard: `findOneAndUpdate({ user, month, aiRequests: { $lt: limit } }, { $inc: { aiRequests: 1 } }, { upsert: true })`. On API failure, `$inc: -1` (refund).

### aisuggestions (M3-A)
user, event, type (budget / food / invitation), inputSnapshot, output (JSON from Gemini), model, status (pending_review / approved / rejected / failed), error, decidedBy, decidedAt, appliedTo { entityType, entityId }.
Approve guard: `findOneAndUpdate({ _id, status: 'pending_review' }, { status: 'approved' })`, so a suggestion can never be applied twice.

### quoterequests (M3-C)
event, customer, provider, category, requirements, status (requested / quoted / revision_requested / approved / rejected / withdrawn), approvedQuote, history [{ action, by, at, note }].
Index: `{ event: 1, category: 1 }`, `{ provider: 1, status: 1 }`.

### quotes (M3-C): one document per version
quoteRequest, event, provider, customer, version, items [{ description, quantity, unit, unitPrice, total }], subtotal, serviceCharge, vat, total, validUntil, note, status (submitted / superseded / approved / rejected), approvedBy, approvedAt.
Index: `{ quoteRequest: 1, version: 1 }` **unique**.

### bookings (M3-C)
event, quote, provider, customer, category,
eventStart, eventEnd, blockStart (= start − setup buffer), blockEnd (= end + cleanup buffer),
status (pending_deposit / confirmed / completed / cancelled_by_customer / cancelled_by_provider),
deposit { amount, status: unpaid / paid, payment, holdExpiresAt }, needsReview, needsReviewReason, replacementOf,
cancellation { by, role, reason, at }, history [{ action, by, at, note }], idempotencyKey (**unique sparse**).
Indexes: `{ provider: 1, blockStart: 1 }`, `{ event: 1 }`, `{ customer: 1 }`.

### venueslots (M3-C): lock rows, the overlap guard
provider, hour (Date truncated to the hour), booking. Index `{ provider: 1, hour: 1 }` **unique**.
Booking a venue = insert one row per hour from blockStart to blockEnd (`insertMany`, ordered). A duplicate-key error means overlap → delete the rows this booking inserted → 409 "Venue busy from … to … (includes setup/cleanup)". Cancelling deletes the booking's slots; the booking document itself is kept.

### reviews (M3-C)
booking (**unique**: one review per booking), provider, customer, rating 1–5, comment, response { text, at }.

### deliveryconfirmations (M3-E)
| Field | Notes |
|---|---|
| task | ref collectiontasks, **unique** (one confirmation per task; changes go through corrections) |
| reservation, organization, kind | kind: orphanage_acceptance / street_distribution |
| quantityCollected | copied from task |
| quantityAccepted, quantityRejectedSafety, quantityRejectedOther, rejectionNote | orphanage |
| quantityDistributed, quantityRemaining | outreach (aggregate only: no recipient data) |
| quantityLost | lost in transit |
| quantityDisputed, dispute { status: none / open / resolved, reason, raisedBy, resolution, resolvedBy } | |
| confirmedBy, confirmedAt, version, idempotencyKey (unique sparse) | |

### pointentries (M3-E / M3-B): reward ledger
user, sourceType (delivery_confirmation / collection_task / contribution), sourceId, action, points, history [{ points, at, reason }].
Index `{ sourceType: 1, sourceId: 1, user: 1 }` **unique**: once per action. Corrections `$set` the new points on the **same** entry (and push history), never insert another one.

### wasterecords (M3-F)
listing, reservation (optional), confirmation (optional), kind (shortage / disposal), quantity, unit, reason (safety_rejected / spoiled / expired / excess / remaining_unused / shortage_at_pickup / lost_in_transit), method (compost / animal_feed / discarded / other), recordedBy, recordedAt.

### correctionrequests (M3-F)
targetType (delivery_confirmation / collection_task / reservation / surplus_listing), targetId, kind (quantity_correction / destination_change), field, oldValue, newValue, newRequest (destination change), reason, status (pending / approved / rejected), requestedBy, reviewedBy, reviewNote, appliedAt.
Approve guard: `{ _id, status: 'pending' }`. Destination change for safety-rejected quantity is refused.

---

## Quantity ledger (the equations that must always balance, checked by M3-F reconciliation and tests)

```
LISTING     quantityTotal = available + quantityReserved + quantityWastedUnreserved          (available ≥ 0)
            quantityReserved = Σ over reservations (quantityReserved − quantityReleased)

RESERVATION quantityReserved = quantityCollected + quantityShortage + quantityReleased + pending
            (pending = still waiting for pickup; becomes 0 once the task is finished)

DELIVERY    orphanage: quantityCollected = accepted + rejectedSafety + rejectedOther + lost + disputed
            outreach:  quantityCollected = distributed + remaining + lost + disputed

CONFIRMED   orphanage accepted total = Σ accepted       (disputed never included)
            street distributed total = Σ distributed     (separate number, never added to orphanage)
```
Each portion is in exactly one bucket at each stage, which is why nothing is counted twice.
Safety-rejected quantity can only move into a `wasterecords` disposal; it never goes back to "available".

## Mockup demo scenario (seed)
Host "Nusrat Rahman" (demo host) · event "Wedding reception" · 200 guests · budget ৳150,000 · Dhaka.
Approved quotes total ৳120,000 (venue ৳70,000 + catering ৳50,000). Providers: venue confirmed, caterer confirmed, decorator quote pending → **2 of 3 confirmed**.
Previous event "Engagement dinner" → surplus 100 portions → orphanage accepted 60 · street distributed 30 · awaiting distribution 10 (remaining).
