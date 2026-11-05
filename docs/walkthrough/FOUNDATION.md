# Walkthrough: Foundation (common workflows)

Not one of the 12 graded features, but **every** member will be asked about login, roles and permissions, because every feature depends on them.

## 1. What it does (plain language)
- People **sign up** with a role: event host, service provider, orphanage coordinator, outreach coordinator or volunteer. Admins exist only through the seed script.
- Hosts and volunteers can work immediately. Providers and coordinators start **pending**; an **admin approves or rejects** them (with a reason). Approving a coordinator also approves the organization they registered.
- **Login** gives the browser a JWT; every later request carries it.
- Each role sees its own **sidebar and dashboard**; the **backend** checks role and ownership on every route.
- Important actions are written to the **audit log** (who, what, when, why), and users get **in-app notifications** (bell icon).
- Admins have a **Demo & settings** page: a "Simulate Telegram outage" switch (used in M2-C) and **Reset demo** (re-runs the seed).

## 2. File map
| File | Role |
|---|---|
| `server/app.js` | Builds the Express app: security middleware, `/api` routes, error handler |
| `server/server.js` | Local start: connect DB, `listen(5000)` |
| `server/api/index.js` + `server/vercel.json` | Vercel serverless entry (Phase 6) |
| `server/config/env.js` | Reads `.env`; refuses to start without `JWT_SECRET` |
| `server/config/db.js` | Cached Mongoose connection (important on serverless) |
| `server/config/constants.js` | Roles, 8 divisions + 64 districts, enums |
| `server/routes/index.js` | **The whole API map**: every prefix and its router |
| `server/routes/auth.routes.js` | `/api/auth/signup`, `login`, `logout`, `me` |
| `server/routes/users.routes.js` | `/api/users/me`, `/api/organizations/mine` |
| `server/routes/admin.routes.js` | `/api/admin/*` (all admin-only via `router.use`) |
| `server/routes/common.routes.js` | `/api/meta`, `/api/dashboard`, `/api/notifications` |
| `server/middleware/auth.js` | `signToken`, `requireAuth`, `requireRole`, `requireApproved` |
| `server/middleware/validate.js` | Runs a zod schema on the body/query, returns 400 with field errors |
| `server/middleware/errorHandler.js` | Turns thrown errors into JSON responses |
| `server/middleware/rateLimits.js` | Request limits (stricter on login/signup) |
| `server/middleware/planGate.js` | `requirePlanFeature('x')` (used from Module 2 on) |
| `server/models/*.js` | `User`, `Organization`, `AuditLog`, `Notification`, `AppSetting`, `Plan` |
| `server/validators/*.schemas.js` | zod schemas for auth, profile, admin |
| `server/controllers/*.controller.js` | The work for each route |
| `server/services/audit.service.js` | `logAudit()`, `diffFields()` |
| `server/services/notify.service.js` | `notifyUsers()` (in-app; Telegram is added by M2-C) |
| `server/services/plan.service.js` | `getEffectivePlan`, `assertWithinLimit`, `assertFeature` |
| `server/services/settings.service.js` | Admin-editable switches |
| `server/seed/*` | `npm run seed`: plans + demo users + organizations |
| `server/scripts/local-db.js` | `npm run db`: local MongoDB without installing it |
| `server/tests/*` | `auth.test.js`, `permissions.test.js`, `helpers.js` |
| `client/src/main.jsx` | Starts React with the router and `AuthProvider` |
| `client/src/App.jsx` | **Every page and its URL** |
| `client/src/api/client.js` | `api.get/post/...`: adds token, turns errors into `ApiError` |
| `client/src/context/AuthContext.jsx` + `hooks/useAuth.js` | Logged-in user, `login`, `signup`, `logout` |
| `client/src/hooks/useFetch.js` | Load data with loading/error state |
| `client/src/hooks/useMeta.js` | Dropdown lists from `/api/meta` (fetched once) |
| `client/src/components/ui/*` | Design system: Button, Card, Badge, Field, Modal, States, Layout, Icon, format |
| `client/src/components/layout/*` | AppShell, Sidebar, `navItems.js`, NotificationBell, UserMenu, RouteGuards, Logo |
| `client/src/pages/common/*` | Login, Signup, Dashboard, Profile, NotFound |
| `client/src/pages/admin/*` | Approvals, Audit log, Demo & settings |

## 3. Request-to-database flow: logging in
1. **LoginPage.jsx**: `handleSubmit` calls `doLogin(email, password)` → `login()` from `useAuth()`.
2. **AuthContext.jsx**: `login` calls `api.post('/auth/login', { email, password })`.
3. **api/client.js**: `fetch('/api/auth/login', { method: 'POST', body: JSON })`. In dev, Vite forwards `/api` to port 5000.
4. **app.js**: helmet → cors → `express.json()` parses the body → rate limiter → `connectDB()` → `routes/index.js`.
5. **auth.routes.js**: `router.post('/login', authLimiter, validate(loginSchema), auth.login)`.
6. **validate.js**: zod checks the email format; if bad, it throws 400 and the controller never runs.
7. **auth.controller.js `login`**: `User.findOne({ email }).select('+passwordHash')` → `bcrypt.compare` → if wrong, `throw httpError(401, …)`.
8. **MongoDB** returns the user document (password hash included only because we asked for it).
9. Controller responds `{ token: signToken(user), user }`. `toJSON` removes `passwordHash`.
10. Back in **AuthContext**: `saveToken(token)` into `localStorage`, then `refresh()` calls `GET /auth/me` to load user + plan.
11. **LoginPage** navigates to `/`. `RequireAuth` now sees a user → `AppShell` + `DashboardPage` render.

Every later request: `client.js` adds `Authorization: Bearer <token>`, and `requireAuth` verifies it and loads `req.user`.

## 4. Key code, explained

### a) `requireAuth`: who is calling? (`server/middleware/auth.js`)
```js
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;   // "Bearer abc" -> "abc"
  if (!token) throw httpError(401, 'Please log in first');
  let payload;
  try { payload = jwt.verify(token, env.jwtSecret); }                     // checks signature + expiry
  catch { throw httpError(401, 'Your session has expired. Please log in again.'); }
  const user = await User.findById(payload.userId);                       // fresh from DB every time
  if (!user) throw httpError(401, 'Account not found');
  req.user = user;                                                        // controllers use req.user
  next();
}
```
- The token only contains `userId`. Role and approval are re-read from the DB, so if an admin rejects someone, it takes effect on their next request.
- `throw` works inside middleware because Express 5 forwards errors (including from `async` functions) to `errorHandler`.

### b) `requireRole`: a function that returns middleware
```js
export function requireRole(...allowedRoles) {          // requireRole('admin') -> allowedRoles = ['admin']
  return (req, res, next) => {
    if (!allowedRoles.includes(req.user.role)) throw httpError(403, 'Your role is not allowed to do this');
    next();
  };
}
```
401 = "we don't know who you are"; 403 = "we know who you are, and you may not do this".

### c) Record-level permission (`notifications.controller.js`)
```js
const notification = await Notification.findOneAndUpdate(
  { _id: req.params.id, user: req.user._id },   // the owner check is part of the query
  { readAt: new Date() },
  { returnDocument: 'after' }                    // return the updated document
);
if (!notification) throw httpError(404, 'Notification not found');
```
Putting `user: req.user._id` in the filter means someone else's notification simply "does not exist" for you. The same pattern protects events, bookings and so on later.

### d) Approval decision (`admin.controller.js`)
```js
user.approvalStatus = status;                 // 'approved' or 'rejected'
user.approvalNote = note;
await user.save();
if (user.organization) await Organization.updateOne({ _id: user.organization }, { approvalStatus: status, ... });
await logAudit({ actor: req.user, action: 'user.approve', ..., changes: [{ field: 'approvalStatus', from: previousStatus, to: status }], reason: note });
await notifyUsers([user._id], { type: 'account.approval', title: 'Your account has been approved', ... });
```
Three effects of one decision: the data change, the history (audit), and telling the person (notification).

### e) The fetch wrapper (`client/src/api/client.js`)
```js
const token = getToken();
if (token) headers.Authorization = `Bearer ${token}`;
...
const data = await response.json().catch(() => ({}));
if (!response.ok) throw new ApiError(data.error || ..., response.status, data.details, data);
```
Every page gets the server's message (`err.message`) and field errors (`fieldErrors(err)`) without repeating this code.

## 5. Likely viva questions
1. **Why hash passwords with bcrypt instead of encrypting them?** A hash is one-way: even we can't recover the password. bcrypt adds a random salt and is deliberately slow, which makes guessing expensive.
2. **What is inside the JWT and why so little?** Only `userId` (+ expiry). Role/approval are read from the DB on each request, so changes apply immediately and the token never holds stale permissions.
3. **401 vs 403?** 401 = not logged in or bad token. 403 = logged in but not allowed (wrong role / not approved).
4. **Where is the role check done: frontend or backend?** Both. The frontend hides pages (`RequireRole`) for a nicer experience, but the **backend** (`requireRole`) is the real protection; anyone can call the API directly.
5. **How do you stop a user reading someone else's record?** Include the owner in the query filter (`{ _id, user: req.user._id }`), and return 404 if nothing matches.
6. **Why does login say "Wrong email or password" for both cases?** So an attacker can't find out which emails have accounts.
7. **What does `validate(schema)` do?** It runs zod on the request body before the controller and returns 400 with `[{ field, message }]`, which the form shows under each input.
8. **Why is `app.listen` not in `app.js`?** So the same app can be used by tests (Supertest), by `server.js` locally, and by Vercel as a serverless function.
9. **Why cache the DB connection?** On Vercel a warm function handles many requests; reconnecting each time is slow and can exhaust Atlas connections.
10. **What is the audit log for, and can it be edited?** It records who changed what, when and why. There is no update or delete route for it.

## 6. Live-modification drills

**Drill 1: Add a "bio" field to the profile.**
1. `server/models/User.js`: add `bio: { type: String, default: '', maxlength: 300 },`
2. `server/validators/users.schemas.js` → `updateProfileSchema`: add `bio: z.string().trim().max(300).default(''),`
3. `server/controllers/users.controller.js` → add `'bio'` to the `diffFields` list.
4. `client/src/pages/common/ProfilePage.jsx` → initial state `bio: user.bio || ''` and add
   `<Textarea label="About you" value={form.bio} onChange={(e) => update({ bio: e.target.value })} />` (import `Textarea` from `Field.jsx`).

**Drill 2: Make passwords require at least one number.**
In `server/validators/auth.schemas.js`, change the password rule to
`z.string().min(8, 'Use at least 8 characters').regex(/\d/, 'Include at least one number')`.
Do the same for `newPassword` in `users.schemas.js`. The signup form shows the message under the field automatically (`fieldErrors`).

**Drill 3: Let admins filter the account list by division.**
1. `server/validators/admin.schemas.js` → `userListQuerySchema`: add `division: z.string().optional()`.
2. `admin.controller.js` → `listUsers`: `if (division) filter.division = division;`
3. `ApprovalsPage.jsx`: add `division: ''` to `filters`, and a third `<Select>` with options from `Object.keys(meta.divisions)`.

## 7. 60-second demo script
1. Open the site → **Login page**: point out the demo account list (read from the database).
2. Click **Create an account** → choose *Outreach coordinator* → fill in → show the organization fields → submit → dashboard says **waiting for approval**.
3. Log out → log in as **Administrator** (`admin@utshob.demo` / `Demo@1234`) → **Approvals** → click **Approve**.
4. Open **Audit log** → the `user.approve` entry with `pending → approved`.
5. Log back in as the coordinator → the banner is gone and the **bell** shows "Your account has been approved".
6. Mention: the backend blocks a host from `/api/admin/*` with 403 (tested in `permissions.test.js`).
