# Walkthrough: M2-A Expenses and contributions
**Owner:** 22201813 (Tareq Sujat) · **Module 2 / Lab 6**
Uses the **shared sandbox checkout** (SSLCOMMERZ), built for M2-A, M3-C and M3-D together; its code is explained here too.

## 1. What it does (plain language)
- **Expenses:** record what the event really cost (category, description, amount, date, who paid, which group paid). A mistake is **voided with a reason**, never deleted: it stays crossed out in the list but stops counting. Expenses feed the M1-A budget summary ("spent" per category, and an alert when spending passes the estimate).
- **Cost split:** costs are shared between **groups** (e.g. the bride's and the groom's family). **Equal** shares are free; **percentage** or **custom amounts** need the **Plus** plan (backend-enforced, 402). Percentages must add up to 100; custom amounts must add up to the expenses. For each group: its share, what it paid to vendors directly, what it contributed (money **received**, not just promised) and what's **outstanding**.
- **Contributions:** **cash**, **goods in kind** (e.g. 50 kg rice, with an estimated value) or **sponsorships** (Plus+; tracking what the sponsor delivered is Pro+). **Pledged** (promised) and **received** are always separate numbers; you can never record more received than pledged. A pledge can be cancelled only while nothing has been received.
- **Pay online:** a cash pledge can be paid through the **SSLCOMMERZ sandbox** (test money). The browser goes to the gateway; when it comes back, **our server asks the gateway's validation API** whether the payment is genuine and for the right amount, and only then adds it to "received". It is counted **once**, even if the gateway calls us back several times.

## 2. File map
| File | Role |
|---|---|
| `server/models/Expense.js` | Expense with `status: recorded/void` + `voidReason` |
| `server/models/Contribution.js` | `amountPledged` vs `amountReceived`; `inKind.quantity` vs `inKind.receivedQuantity`; `receipts[]`; `appliedPayments[]` |
| `server/models/Event.js → costSplit` | `{ method, groups: [{ name, percentage, fixedAmount }] }` |
| `server/models/Payment.js` | One sandbox payment; unique `tranId`; `status`; `appliedAt` |
| `server/services/split.service.js` | **`computeSplitSummary`** (pure maths) |
| `server/services/contribution.service.js` | **`receiveCash`** (guarded `$inc`), `statusFor`, `applyContributionPayment` |
| `server/services/sslcommerz.service.js` | Gateway calls: `initSession`, `validate`, `queryByTranId` (timeouts, 502/503 errors) |
| `server/services/payment.service.js` | `startPayment`, **`confirmPayment` (idempotent)**, `closePayment` |
| `server/services/budget.service.js → committedCosts` | Sums recorded expenses per category for the budget summary |
| `server/validators/m2a.money.schemas.js` | zod: expense, split (sums), contribution (per type), receive, checkout |
| `server/controllers/m2a.money.controller.js` | Expenses, split, contributions, checkout |
| `server/controllers/payments.controller.js` | Gateway callbacks (success/fail/cancel/IPN), payment status, "check status" |
| `server/routes/m2a.money.routes.js` / `payments.routes.js` | All URLs |
| `server/seed/data/money.js` | Wedding: 4 expenses + 1 void, equal split, 3 contributions; Engagement: finished money story |
| `server/tests/m2a.money.test.js`, `payments.test.js` | 7 + 6 tests (fake gateway with `vi.spyOn(fetch)`) |
| `client/src/pages/m2a-money/EventExpensesTab.jsx` | Tiles, "Who pays what", record expense, list + void |
| `…/EventContributionsTab.jsx` | Totals, contributions, add / receive / pay online / fulfilment / cancel |
| `…/PaymentResultPage.jsx` | `/payments/:tranId`, the page the gateway returns to, with "Check status" |
| `client/src/api/m2a.money.api.js` | All calls |

## 3. Request-to-database flow: paying a pledge online
1. **Contributions tab → "Pay online"** → amount → `moneyApi.checkout(id, 2000)` → `POST /api/contributions/:id/checkout`.
2. **`checkoutContribution`**: organizer check → amount ≤ still pledged → **`startPayment`** creates a `Payment` (`status: initiated`, unique `tranId` like `UTS-1793948205-3f9a1c`) → **`initSession`** POSTs our store id, amount, `tran_id` and our callback URLs to SSLCOMMERZ → gets `GatewayPageURL`.
3. React sets `window.location.href = gatewayUrl`: the user pays on the sandbox page with test card/mobile banking.
4. The gateway sends the **browser** back with a form POST to `/api/payments/sslcommerz/success` containing `tran_id` and `val_id`. (It may also call `/ipn` server-to-server.)
5. **`gatewaySuccess`** → **`validate(val_id)`**: *our server* asks `validationserverAPI.php` → `{ status: 'VALID', tran_id, amount, currency }`.
6. **`confirmPayment`**: checks status/tran_id/amount/currency match → `initiated → paid` (guarded) → claims `appliedAt` (guarded) → `applyContributionPayment` → **`receiveCash`** `$inc amountReceived` only if this payment id is **not** already in `appliedPayments`.
7. MongoDB: payment `paid`; contribution `amountReceived +2000`, a receipt `{ method: 'sandbox', payment }`.
8. Redirect (303) → React `/payments/:tranId` → "Payment received ৳2,000 · Verified by our server".
If the browser never comes back, **"Check status"** calls `POST /payments/:tranId/verify` → `queryByTranId` → the same `confirmPayment`.

## 4. Key code, explained

### a) Pledged vs received, guarded (`contribution.service.js → receiveCash`)
```js
Contribution.findOneAndUpdate(
  { _id, status: { $ne: 'cancelled' }, type: { $in: ['cash', 'sponsorship'] },
    $expr: { $lte: [{ $add: ['$amountReceived', amount] }, '$amountPledged'] },  // never above the pledge
    ...(payment ? { appliedPayments: { $ne: payment } } : {}) },               // a payment only once
  { $inc: { amountReceived: amount },
    $push: { receipts: { amount, method, payment, ... } },
    ...(payment ? { $addToSet: { appliedPayments: payment } } : {}) },
  { returnDocument: 'after' });
```
`amountPledged` is never changed by receiving. The guard is in the filter, so it is atomic (same pattern as M1-C).

### b) Idempotent payment confirmation (`payment.service.js → confirmPayment`)
```js
// 1) genuine and for exactly this payment?
const matches = ['VALID','VALIDATED'].includes(validation.status) && validation.tran_id === tranId
             && Math.abs(Number(validation.amount) - payment.amount) < 0.01 && validation.currency === 'BDT';
// 2) initiated -> paid: only the first caller matches
await Payment.findOneAndUpdate({ _id, status: 'initiated' }, { status: 'paid', valId, verifiedAt: new Date() });
// 3) claim the side effect: only the first caller gets a document back
const claimed = await Payment.findOneAndUpdate({ _id, status: 'paid', appliedAt: null }, { appliedAt: new Date() }, ...);
if (claimed) await applyEffect(claimed);    // -> applyContributionPayment
```
The success redirect, the IPN and the "check status" button can arrive in any order and any number of times; the money is counted once. The test **"success callback + IPN … count the money once"** proves it.
Why validate with the gateway instead of trusting the POST? Anyone can send a fake form POST saying `status=VALID`. Only the gateway's validation API, called by our server with our store password, can confirm it.

### c) The split (`split.service.js`)
```js
const shareOf = (group) => method === 'percentage' ? total * group.percentage / 100
                         : method === 'custom'     ? group.fixedAmount
                         : total / groups.length;                     // equal
outstanding = share - paidDirectly - contributed;   // negative = paid more than its share
```
`contributed` counts only `amountReceived` of cash/sponsorship contributions for that group, never pledges.

### d) Plan gate (`m2a.money.controller.js → setSplit`)
```js
if (method !== 'equal') await assertFeature(await ownerOf(event), 'customSplits');   // 402 on Starter
```
The plan is the **event owner's** (the account that pays), read from the `plans` collection.

## 5. Likely viva questions
1. **Why keep pledged and received as two fields?** A promise isn't money. Reports and the split must count only what actually arrived; mixing them would overstate the money available.
2. **What stops recording more than was pledged?** The `$expr` guard in `receiveCash` (atomic). The response says how much is still pledged.
3. **Why void instead of delete?** History and audit: you can see what was entered and why it was corrected. Void expenses are excluded from totals.
4. **How is the payment verified?** Our server calls SSLCOMMERZ's validation API with `val_id` and our store password, then compares `tran_id`, amount and currency with our own record.
5. **What if the success page is reloaded, or the IPN arrives too?** `confirmPayment` is idempotent: guarded status change + `appliedAt` claim + `appliedPayments` guard. Money is counted once.
6. **What if the gateway is down?** `fetch` has a 15 s timeout → 502 "gateway not responding… record the payment manually". The payment is marked failed. Without credentials the API answers 503 and the button is disabled with an explanation.
7. **What if the user closes the tab after paying?** The result page's "Check status" asks the gateway by `tran_id` (`queryByTranId`) and confirms.
8. **How is "outstanding" for a group calculated?** share − paid directly to vendors − cash received from that group.
9. **Why are percentage splits limited to Plus?** That's the plan table; `assertFeature(owner, 'customSplits')` enforces it in the backend.
10. **Why is the plan checked for the event owner, not the logged-in co-organizer?** The owner's subscription pays for the event's features.

## 6. Live-modification drills

**Drill 1: Add a "payment method" field to expenses (cash / bKash / bank).**
1. `Expense.js`: `paymentMethod: { type: String, enum: ['cash', 'bkash', 'bank'], default: 'cash' },`
2. `m2a.money.schemas.js → expenseSchema`: `paymentMethod: z.enum(['cash', 'bkash', 'bank']).default('cash'),`
3. `EventExpensesTab.jsx → ExpenseForm`: add `paymentMethod: 'cash'` to `empty` and a `<Select label="Payment method" …>`; show it in `ExpenseList`.

**Drill 2: Refuse online payments below ৳100.**
`m2a.money.schemas.js → checkoutSchema`: `amount: money.min(100, 'Online payments start at ৳100')`.

**Drill 3: Show the contributor's phone on each contribution card.**
`EventContributionsTab.jsx`, after the name: `{c.contributorPhone && <span className="text-xs text-muted"> · {c.contributorPhone}</span>}`.

## 7. 60-second demo script
Log in as **Event host** (`host@utshob.demo` / `Demo@1234`) → Wedding reception.
1. **Expenses & split**: ৳30,500 spent; "Who pays what": bride's family paid ৳19,750 extra, groom's family owes ৳9,750. Add an expense → totals change → **Void** it (stays, crossed out).
2. **Change split → By percentage** → "Plan feature" (Starter: equal only).
3. **Contributions**: pledged ৳25,000 vs received ৳10,000 (separate). Cousin Mitu → **Record received ৳6,000** → refused (pledge is ৳5,000) → ৳2,000 → received updates.
4. **Pay online** (if sandbox credentials are set): pay ৳1,000 on the SSLCOMMERZ test page → back on "Payment received · Verified by our server" → the contribution shows "paid online".
5. **Budget** tab: "spent" now comes from these expenses.
