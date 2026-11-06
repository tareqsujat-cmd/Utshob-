# Walkthrough: M1-A Event management
**Owner:** 22201813 (Tareq Sujat) · **Module 1 / Lab 5**

## 1. What it does (plain language)
A host plans an event: title, type, date and time, location (division, district, address, optional map pin), expected guests, total budget, services needed (venue, catering, decoration, transport), dietary needs and a menu.

- **Search** previous events by title, status and date range.
- **Edit** details. Changing a *requirement* (guests, budget, location, dietary needs, services) **needs a reason**, and every change is stored in the **history** (who, when, what from → to, why).
- **Copy** any previous event into a new **draft** (same requirements, menu and budget lines, but no RSVPs, batches or bookings; a banner says prices may have changed).
- **Cancel** (with reason) or **reschedule** (new dates + reason): other organizers get a notification, and nothing is deleted. Cancelled and completed events become **read-only**.
- **Co-organizers** can be added by email. The **plan** limits active events and organizers (Starter: 1 and 1), and the **backend** enforces it (HTTP 402).
- **Budget:** five categories (food, venue, decoration, transport, other). Every save is a **new version** with a reason. Scenarios (e.g. "Standard", "Lean") are limited by plan. The summary compares **budget vs estimate vs approved quotes vs spending** and shows **alerts**: over budget, quotes/expenses above estimate, missing charges (a needed service with no money), unallocated money.
- **Invitation:** heading, message, colour palette, font, layout, reply-by date, publish switch, with a live preview. Guests open a **public link without logging in** and reply yes/no/maybe with party size. **One reply per phone number**; replying again updates it.
- **Food plan:** each dish has a unit (kg / piece / litre / portion) and an amount per guest. Portions for non-portion units are shown as **"≈ estimated"**. Cooking **batches** go planned → cooking → cooked (or cancelled). When attendance changes (e.g. confirmed RSVPs), the system **suggests** changes to **planned batches only**. The host approves, and a guarded update applies them: a batch that started cooking in the meantime is **skipped, never changed**.

## 2. File map
| File | Role |
|---|---|
| `server/models/Event.js` | Event + embedded `menu[]`, `dietary[]`, `invitation{}`; partial unique index on `invitation.slug` |
| `server/models/Budget.js` | One scenario; `lines[]` = current version, `versions[]` = every version |
| `server/models/Rsvp.js` | Guest reply; **unique (event, contact)** |
| `server/models/CookingBatch.js` | One batch with status |
| `server/config/constants.js` | Event types, statuses, budget categories, services → budget category, units, `BATCH_TRANSITIONS`, invitation themes |
| `server/services/event.service.js` | `findEventForUser` / `findEditableEvent` (permissions + read-only rule), `countActiveEvents`, `notifyEventParties` |
| `server/services/budget.service.js` | `createScenario`, **`saveNewVersion`** (optimistic concurrency), **`buildBudgetSummary`** (alerts), `committedCosts` (filled by M2-A/M3-C) |
| `server/services/foodplan.service.js` | **`computeFoodPlan`**, **`suggestAdjustments`**: pure maths, no database |
| `server/services/plan.service.js` | `assertWithinLimit`, `assertCountAllowed` (402 + upgrade hint) |
| `server/validators/m1a.events.schemas.js` | zod: event create/edit, reschedule, cancel, copy, budget lines, invitation, RSVP (phone normalising), menu, batches, apply |
| `server/controllers/m1a.events.controller.js` | list/search, create, get, update (reason rule), plan, complete, copy, cancel, reschedule, history, organizers |
| `server/controllers/m1a.budget.controller.js` | scenarios list/create, save version, make primary, summary |
| `server/controllers/m1a.invitation.controller.js` | save invitation (slug), public invitation, **RSVP upsert**, RSVP list |
| `server/controllers/m1a.foodplan.controller.js` | menu (unit rule), food plan, batches, status transitions, **suggest**, **apply (guarded)** |
| `server/routes/m1a.events.routes.js` | `/api/events/*`, `/api/budgets/*`, `/api/batches/*`, `/api/public/*` |
| `server/seed/data/events.js` | Wedding reception (200 guests, ৳150,000, 54 RSVPs = 156 confirmed, 7 batches), completed Engagement dinner, another host's event |
| `server/tests/m1a.events.test.js` | 13 tests |
| `client/src/api/m1a.events.api.js` | All write calls |
| `client/src/pages/m1a-events/EventsListPage.jsx` | Search + plan usage badge |
| `…/EventFormPage.jsx` | Create / edit (reason box) |
| `…/EventLayout.jsx` | Header, actions, cancel/reschedule/copy dialogs, tabs, `<Outlet context>` |
| `…/EventOverviewTab.jsx`, `EventBudgetTab.jsx`, `EventFoodTab.jsx`, `EventInvitationTab.jsx`, `EventHistoryTab.jsx` | The tabs |
| `…/InvitationCard.jsx` | The invitation design (shared by preview and public page) |
| `…/PublicInvitationPage.jsx` | `/invite/:slug` for guests (no login) |
| `client/src/components/AuditEntry.jsx` | One history entry (also used by the admin audit log) |

## 3. Request-to-database flow: adjusting the food plan
1. **EventFoodTab → AttendancePicker**: the host clicks "Confirmed RSVPs (156)". `attendance` state changes, so `useFetch` reloads `GET /api/events/:id/food-plan?attendance=156`.
2. **getFoodPlan**: `findEventForUser` checks the user is an organizer → loads batches → `computeFoodPlan(menu, batches, 156)` → the table shows needed/cooked/cooking/planned/difference.
3. **AdjustPanel → "Suggest adjustments"**: `eventsApi.suggestFoodPlan(id, 156)` → `POST /api/events/:id/food-plan/suggest`.
4. Route: `requireAuth` → `requireRole('host')` → `validate(suggestSchema)` → **`suggestFoodPlan`**: `findEditableEvent` (organizer + not cancelled/completed) → `suggestAdjustments(...)` returns e.g. `{ type: 'update', batchId, from: 35, to: 19.6 }`. **Nothing is saved.**
5. The UI lists the suggestions in words. The host clicks **Approve & apply** → `POST /food-plan/apply` with the same adjustments.
6. **`applyFoodPlan`**, for each change:
   `CookingBatch.findOneAndUpdate({ _id, event, status: 'planned', quantity: from }, { quantity: to })`.
   If the batch started cooking or its quantity changed since the suggestion, the filter matches nothing → **skipped**.
7. **MongoDB** updates the matching batches. `logAudit('event.food_plan_adjust')` records "N applied, M skipped" with the attendance.
8. Response `{ applied, skipped }` → the UI shows "4 change(s) applied" (or the skipped warning) and reloads: every row is "On target".

## 4. Key code, explained

### a) The reason rule (`m1a.events.controller.js → updateEvent`)
```js
const before = event.toObject();                       // plain copy BEFORE the change
event.set(fields);                                     // apply the form values (not saved yet)
const changes = diffFields(before, event.toObject(), [...REQUIREMENT_FIELDS, ...OTHER_FIELDS]);
const requirementChanged = changes.some((c) => REQUIREMENT_FIELDS.includes(c.field));
if (requirementChanged && !reason) throw httpError(400, 'Please say why the requirements changed', [...]);
await event.save();
await logAudit({ ..., action: 'event.update', changes, reason });   // history = audit log entries
```
`diffFields` compares field by field (JSON for objects/arrays) and returns `[{ field, from, to }]`. The history tab simply shows these audit entries.

### b) Plan limits (`plan.service.js`)
```js
export function assertWithinLimit(user, limitName, currentCount) {
  return assertCountAllowed(user, limitName, currentCount + 1);   // "one more" must still fit
}
export async function assertCountAllowed(user, limitName, newCount) {
  const plan = await getEffectivePlan(user);
  if (newCount <= plan.limits[limitName]) return plan;
  throw httpError(402, `Your ${plan.name} plan allows ...`, undefined, { upgradeTo, limit, limitName });
}
```
Used as `await assertWithinLimit(req.user, 'activeEvents', await countActiveEvents(req.user._id))` before creating or copying. The numbers live in the `plans` collection, not in code.

### c) Budget versions without lost updates (`budget.service.js → saveNewVersion`)
```js
const updated = await Budget.findOneAndUpdate(
  { _id: budgetId, version: expectedVersion },            // only if nobody saved since I loaded it
  { $set: { lines: clean }, $inc: { version: 1 },
    $push: { versions: { version: expectedVersion + 1, lines: clean, total, changedBy, reason, source } } },
  { returnDocument: 'after' }
);
if (!updated) throw httpError(409, 'Someone else changed this budget meanwhile. Reload ...');
```
One atomic update does three things: replace the lines, bump the version number, append the snapshot. Two people editing version 2 at once: the first makes version 3, and the second's filter `version: 2` no longer matches → 409. Nothing is silently overwritten (this is *optimistic concurrency*).

### d) RSVP upsert (`m1a.invitation.controller.js → submitRsvp`)
```js
const filter = { event: event._id, contact: phone };      // phone already normalised by zod: 01XXXXXXXXX
const rsvp = await Rsvp.findOneAndUpdate(filter,
  { $set: { guestName, response, partySize, dietaryNotes } },
  { upsert: true, returnDocument: 'after', runValidators: true });
```
`upsert: true` = update it if it exists, otherwise insert it. Together with the **unique index (event, contact)**, the same guest can never be counted twice, even if they type the number as "+880 1711-…" the second time (normalised to the same `01711…`).

### e) Suggestions only touch planned batches (`foodplan.service.js`)
```js
const covered = completed + started + planned;     // completed + started are LOCKED
const difference = required - covered;
if (difference > 0)  -> grow the biggest planned batch (or add one)
if (difference < 0)  -> shrink planned batches, biggest first; cancel if it reaches 0
                        if planned isn't enough: a note "already cooked/cooking ... consider surplus"
```
It's a pure function (input → output, no database), so it's easy to test and to explain.

## 5. Likely viva questions
1. **Why does a guest-count change need a reason, but a title change doesn't?** Requirements drive costs and food; the spec asks for a requirement-change history. `REQUIREMENT_FIELDS` lists which fields count.
2. **Where is the change history stored?** In `auditlogs` (`entityType: 'event'` and `'budget'`), written by `logAudit`. `GET /events/:id/history` reads them.
3. **What stops two people overwriting each other's budget?** The `version` in the filter of `findOneAndUpdate` (optimistic concurrency). A stale save gets 409.
4. **How are old budget versions kept?** `$push` appends a snapshot to `versions[]` in the same atomic update; nothing is overwritten.
5. **How do you stop duplicate RSVPs?** Unique index on (event, contact) + `upsert`. The phone is normalised first.
6. **Why does applying the food plan use `status: 'planned', quantity: from` in the filter?** So a batch that started cooking, or was edited, after the suggestion is never changed. It is reported as skipped instead.
7. **Why are portion numbers labelled "estimated"?** Converting kg/litres/pieces to portions depends on serving size (`portionsPerUnit`), so it's an estimate. Only the unit `portion` is exact.
8. **Can a dish change unit after batches exist?** No: `saveMenu` returns 409, so kg batches can't silently become litres (consistent units).
9. **What happens when an event is cancelled?** Status `cancelled` + reason, audit entry, organizers notified, and everything else is kept. `findEditableEvent` then refuses changes (409).
10. **How is the plan limit enforced, and what does the user see?** `assertWithinLimit` throws 402 with `upgradeTo`. The form shows "Plan limit reached …". Limits come from the `plans` collection.

## 6. Live-modification drills

**Drill 1: Add "photography" as a required service.**
1. `server/config/constants.js`: add `'photography'` to `REQUIRED_SERVICES`, `SERVICE_LABELS.photography = 'Photography'`, and `SERVICE_BUDGET_CATEGORY.photography = 'other'`.
2. Done: the form's checkboxes and the missing-charge alert read these lists (through `/api/meta` and `buildBudgetSummary`).

**Drill 2: Limit the RSVP party size to 10.**
`server/validators/m1a.events.schemas.js → rsvpSchema`: `partySize: z.coerce.number().int().min(1).max(10)`. Also `server/models/Rsvp.js`: `max: 10`, and `PublicInvitationPage.jsx`: `max="10"` on the input. The server message appears under the field automatically.

**Drill 3: Warn when a category uses more than 60% of the budget.**
In `buildBudgetSummary`, inside the `for (const row of rows)` loop:
```js
if (event.budgetTotal && row.expected > event.budgetTotal * 0.6) {
  alerts.push({ level: 'warning', code: 'large_share', message: `${label} takes more than 60% of the budget.` });
}
```
The Budget tab shows every alert automatically.

## 7. 60-second demo script
Log in as **Event host** (`host@utshob.demo` / `Demo@1234`).
1. **Dashboard**: next event "Wedding reception": budget ৳1,50,000, 156 / 200 confirmed guests, Starter plan 1/1 active events.
2. **Open event → History**: "guestCount 180 → 200, reason: Groom's side added 20 guests".
3. **Budget** tab: breakdown + version history (v1 → v2 with reason). Click **New scenario** → *Plan limit reached* (Starter allows 1).
4. **Invitation & RSVPs**: change the colour → live preview → open the public link in a private window → reply as a guest → the count goes up.
5. **Food plan**: click **Confirmed RSVPs** → the differences appear → **Suggest adjustments** → read one line ("planned batch 35 → 20 kg; the cooking chicken is untouched") → **Approve & apply** → all **On target**.
6. **Edit**: change guests to 190 without a reason → refused; add a reason → saved, then show it in History.

(After M3-D, the demo host is on the Plus plan, so **Copy to new event** and a second budget scenario can also be shown.)
