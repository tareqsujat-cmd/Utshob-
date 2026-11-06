# Walkthrough: M2-C Collection logistics (Telegram Bot API)
**Owner:** 22301024 (Mehreen Mallick Fiona) · **Module 2 / Lab 6** · **External API: Telegram Bot API**

## 1. What it does (plain language)
After food is reserved (M1-C), someone has to fetch it.
- A **coordinator assigns a collector**: one of the registered **volunteers**, or someone the organization arranges itself (name + phone), with a pickup time. **Only one active task per reservation**, even if "Assign" is clicked twice.
- Collectors and coordinators **track the pickup**: on the way → collected (all) or **partially collected** (the rest is recorded as a *shortage*), or **delayed** (minutes + reason), **cancelled** (assign someone else), **missed** (the food goes back to the listing for others). Volunteers can't cancel or mark missed.
- **Telegram:** any user can **connect Telegram** (Profile → get a code → send it to our bot → Verify). Then assignments, status changes and **reminders** arrive in Telegram too.
- **Telegram is never required.** Every notification is stored in the app first (bell + Collections page). Each Telegram attempt is **logged** (sent / failed + error + attempts). A failed one has a **Retry** button that re-sends **the same notification**: it can never create a duplicate task or message.
- **Reminders:** "Send due reminders" (or a daily Vercel Cron) reminds collectors about pickups in the next 3 hours, **once per task**.
- **Demo switch:** Admin → Demo & settings → "Simulate Telegram outage" makes every send fail, to show the log, Retry and the dashboard fallback.

## 2. File map
| File | Role |
|---|---|
| `server/models/CollectionTask.js` | Task: collector, schedule, status, `quantityCollected`, delay, history; **`activeKey` (unique partial)**, `idempotencyKey` |
| `server/models/Notification.js → telegram` | Delivery state per notification: `skipped / pending / sending / sent / failed`, `attempts`, `lastError` |
| `server/models/User.js → telegram` | `chatId`, `linkCode`, `linkedAt` |
| `server/services/telegram.service.js` | **The external API**: `sendMessage` (timeout, demo outage switch), `recentMessages` (getUpdates), `isConfigured` |
| `server/services/notify.service.js` | `notifyUsers(..., { telegram: true })` → in-app first, then **`deliverTelegram`** (guarded claim, logs outcome) |
| `server/config/constants.js` | `TASK_TRANSITIONS`, `ACTIVE_TASK_STATUSES`, `REMINDER_WINDOW_HOURS` |
| `server/validators/m2c.collection.schemas.js` | Assign, status change (reason/quantity rules) |
| `server/controllers/m2c.tasks.controller.js` | Volunteers, **assign**, list, **status**, reminders (button + cron), **retry** |
| `server/controllers/m2c.telegram.controller.js` | Status, link code, verify, unlink |
| `server/routes/m2c.collection.routes.js` | All URLs |
| `server/vercel.json → crons` | Daily `/api/cron/reminders` (Vercel sends `Authorization: Bearer CRON_SECRET`) |
| `server/seed/data/collection.js` | Past collected pickups; today: one pickup due in ~90 min, one without a collector |
| `server/tests/m2c.collection.test.js` | 10 tests (fake Telegram via `vi.spyOn(fetch)`) |
| `client/src/pages/m2c-collection/TasksPage.jsx` | Collections / My pickups: actions, assign modal, status modal, Telegram deliveries + Retry |
| `client/src/components/TelegramCard.jsx` | Connect / verify / disconnect on the Profile page |

## 3. Request-to-database flow: assigning a collector (with Telegram)
1. **TasksPage → Assign collector** → choose reservation + volunteer + time → `collectionApi.assign(reservationId, body, key)` → `POST /api/reservations/:id/tasks` with `Idempotency-Key`.
2. Route: `requireAuth` → coordinator role → `requireApproved` → `validate(assignSchema)`.
3. **`assignCollector`**: same key seen before? → return it. Reservation must be my organization's and still `reserved`/`collection_assigned`. → `CollectionTask.create({ ..., activeKey: reservationId })`. If another active task exists, the **unique `activeKey` index** throws 11000 → 409.
4. Reservation → `collection_assigned`; audit entry.
5. **`notifyUsers([volunteer, poster], { telegram: true, relatedTask })`**: creates **in-app notifications** (MongoDB) → for users with a `chatId`: status `pending` → **`deliverTelegram`** → claim (`pending|failed → sending`, `attempts + 1`) → `sendMessage` → `POST https://api.telegram.org/bot<token>/sendMessage` → status `sent`, or `failed` + `lastError`.
6. Response 201 → the task card appears with its "Telegram deliveries" box.
**Retry**: `POST /api/notifications/:id/retry` → checks it's `failed` and the user may see the task → **`deliverTelegram(sameId)`** again.

## 4. Key code, explained

### a) One active task per reservation (`CollectionTask.js` + `assignCollector`)
```js
collectionTaskSchema.index({ activeKey: 1 }, { unique: true, partialFilterExpression: { activeKey: { $type: 'string' } } });
// create: activeKey = String(reservation._id)
// final status (collected / partially_collected / cancelled / missed): $unset: { activeKey: 1 }
```
Two clicks at the same moment both try to insert `activeKey = R1`. MongoDB accepts the first and refuses the second (duplicate key). The test fires both with `Promise.all`. When a task ends, the key is removed, so a new collector can be assigned after a cancellation.

### b) Telegram never blocks the dashboard (`notify.service.js → notifyUsers`)
```js
const notification = await Notification.create({ user, type, title, body, link, relatedTask });  // 1) always stored
...
if (!user?.telegram?.chatId) continue;                        // not connected -> stays "skipped"
await Notification.updateOne({ _id }, { 'telegram.status': 'pending' });
await deliverTelegram(notification._id);                       // 2) optional extra copy
```

### c) Logged, guarded delivery and retry (`deliverTelegram`)
```js
const notification = await Notification.findOneAndUpdate(
  { _id, 'telegram.status': { $in: ['pending', 'failed'] } },              // only something not yet sent
  { $set: { 'telegram.status': 'sending', 'telegram.lastAttemptAt': new Date() }, $inc: { 'telegram.attempts': 1 } },
  { returnDocument: 'after' });
if (!notification) return ...;                                              // already sent / sending
try { await sendMessage(chatId, text); /* status: sent */ }
catch (err) { /* status: failed, lastError: err.message */ }
```
Retry works on **this** notification: no new task, no new notification. Two retries at once → only one claims it.

### d) The external call with timeout and demo switch (`telegram.service.js → sendMessage`)
```js
if (await getSetting('telegramFaultInjection')) throw new Error('Simulated Telegram outage (demo switch is on)');
if (!isConfigured()) throw new Error('Telegram bot is not configured on this server');
response = await fetch(api('sendMessage'), { method: 'POST', body: JSON.stringify({ chat_id: chatId, text }),
                                            signal: AbortSignal.timeout(8000) });
if (!data.ok) throw new Error(`Telegram error: ${data.description}`);
```

### e) Linking without a webhook (`m2c.telegram.controller.js → verifyLink`)
```js
const found = messages.reverse().find((m) => m.text === `/start ${linkCode}` || m.text.toUpperCase() === linkCode);
// -> save found.chatId on the user
```
A bot may only message people who wrote to it first. `getUpdates` lists recent messages to the bot; the 6-character code (valid 30 min) tells us which chat is this user. No public webhook is needed, so it works on localhost too.

### f) Reminders once (`sendDueReminders`)
```js
const claimed = await CollectionTask.findOneAndUpdate({ _id, reminderSentAt: null }, { reminderSentAt: now });
if (!claimed) continue;                                    // already reminded
notifyUsers(..., { dedupeKey: `reminder:${task._id}:${task.scheduledAt.toISOString()}`, telegram: true });
```

## 5. Likely viva questions
1. **What stops two collectors being assigned to the same reservation?** The unique partial index on `activeKey`. The second insert fails → 409.
2. **What if the coordinator double-clicks Assign?** Same `Idempotency-Key` → the existing task is returned (200).
3. **Telegram is down. What still works?** Everything: tasks, status updates and in-app notifications. Only the Telegram copy fails; it's logged with the error and can be retried.
4. **How do you guarantee Retry doesn't duplicate tasks?** Retry only calls `deliverTelegram` on the existing notification id; it never calls the assign code. The test counts tasks and notifications before and after.
5. **How does the bot know a user's chat id?** The user sends our code to the bot; `getUpdates` returns that message with its chat id.
6. **What happens on a partial collection?** `quantityCollected` = what was collected, `quantityShortage` = reserved − collected, kept as separate fields (M3-F later records the shortage).
7. **What happens when a pickup is missed?** The reservation becomes `missed` with `quantityReleased`, and the listing's reserved quantity goes down, so others can take it before the deadline.
8. **How are reminders sent without a background server?** A coordinator's button, or Vercel Cron calling `/api/cron/reminders` daily with a secret. `reminderSentAt` + `dedupeKey` ensure once per task.
9. **Why can't a volunteer cancel a task?** Only the coordinator decides about the reservation. The UI hides the actions and the coordinator's organization check is in the controller.
10. **Which status changes are allowed?** `TASK_TRANSITIONS` in constants; anything else gets 409 (e.g. collected → en route).

## 6. Live-modification drills

**Drill 1: Remind 6 hours ahead instead of 3.** `constants.js`: `REMINDER_WINDOW_HOURS = 6;` (and the message text in `TasksPage.jsx → reminders`).

**Drill 2: Require a reason for "partially collected".**
`m2c.collection.schemas.js`: change the last refine to `!['cancelled', 'missed', 'delayed', 'partially_collected'].includes(d.status) || d.reason.length >= 3`.

**Drill 3: Include the collector's phone in the Telegram assignment message.**
`m2c.tasks.controller.js → assignCollector`: in `notifyUsers` body add `` `Collector phone: ${collector.phone}` ``. The same text goes to the bell and to Telegram.

## 7. 60-second demo script
1. Log in as **Outreach coordinator** (`outreach@utshob.demo` / `Demo@1234`) → **Collections**: "Chicken biryani" with Sadia, pickup in ~90 min → **Send due reminders** → "1 reminder(s) sent".
2. **Assign collector** → "Egg curry and rice" → *Someone our organization arranges* → name → Assign → new card.
3. Log in as **Volunteer** (`volunteer@utshob.demo`) → **My pickups** → *On the way* → *Collected part…* 25 → finished (shortage 5).
4. **Telegram (needs the bot token):** Volunteer → Profile → *Connect Telegram* → send the code to the bot → *Verify* → welcome message on the phone. Admin → Demo & settings → **Simulate Telegram outage ON** → coordinator assigns/updates → the delivery shows **failed** with "Simulated Telegram outage" while the card is still on the dashboard → switch **OFF** → **Retry** → **sent**, still one task.
