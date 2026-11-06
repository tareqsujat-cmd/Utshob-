# Glossary

Plain-language explanations of every concept the code uses. Read an entry before you meet it in code. It grows as we build.

---

## Architecture

**MERN**: MongoDB (database), Express (web server framework), React (UI), Node.js (runs JavaScript on the server).

**REST API**: the server exposes URLs like `POST /api/events`. The method says what to do (GET read, POST create/action, PATCH partial update, PUT replace, DELETE remove), and the path says on what.

**Route → middleware → controller → model**: how one request travels through our server.
- *Route*: maps a URL + method to functions (`router.post('/events', requireAuth, validate(schema), createEvent)`).
- *Middleware*: a function `(req, res, next)` that runs before the controller. It can stop the request (send 401/403/400) or call `next()` to continue. Examples: check the token, check the role, validate the body.
- *Controller*: the function that does the work for that route and sends the response.
- *Model*: the Mongoose class for a collection (`Event.create(...)`, `Event.find(...)`).

**Service**: a plain module with functions that more than one controller needs, or that talks to an external API (`gemini.service.js`). It keeps controllers short.

**Central error handler**: one Express middleware with 4 arguments `(err, req, res, next)` at the end of `app.js`. Controllers just `throw httpError(409, 'Venue busy')`, and the handler turns that into a JSON response. Express 5 catches errors from `async` functions automatically.

**Environment variables / `.env`**: secrets and settings (DB URL, API keys) live outside the code in a `.env` file that is never committed. `.env.example` lists the names with fake values so teammates know what to set.

**Serverless function (Vercel)**: instead of a server running all the time, Vercel starts our Express app on demand for each request. Consequences: no background timers, no files saved to disk, and we reuse ("cache") the database connection between requests.

**CORS**: browsers block a page on one domain from calling an API on another unless the API says it's allowed. Our server allows only `CLIENT_ORIGIN`.

## Security

**bcrypt**: turns a password into a one-way hash (with a random salt). We store the hash, never the password. Login re-hashes the typed password and compares.

**JWT (JSON Web Token)**: a signed string the server gives you at login, containing your user id and role. The client sends it in the `Authorization: Bearer <token>` header. The server verifies the signature with `JWT_SECRET`, so a token can't be faked or edited.
*Trade-off*: we keep it in `localStorage` (simple). A malicious script on the page (XSS) could read it; React escaping and helmet reduce that risk. httpOnly cookies are safer but harder to set up across two Vercel domains.

**Role-based access (`requireRole`)**: middleware that rejects users whose role isn't allowed on that route (403).

**Record-level permission**: even with the right role, you may only touch *your* records. For example, a host may edit an event only if their id is in `event.organizers`. This check lives in the controller after loading the record.

**helmet**: adds safe HTTP headers. **express-rate-limit**: limits requests per IP (e.g. 10 logins per 15 min) to slow down password guessing and spam.

**zod**: a library to describe the expected shape of input (`z.object({ guestCount: z.number().int().positive() })`). Our `validate` middleware rejects bad input with 400 before the controller runs.

## MongoDB / Mongoose

**Document / collection**: a document is one JSON-like record; a collection is a group of them (like rows and a table).

**Schema / model**: a Mongoose schema lists the fields, types, defaults and validation of a collection; the model is the class created from it.

**ref / populate**: a field can store another document's `_id` (`owner: { type: ObjectId, ref: 'User' }`). `.populate('owner')` replaces the id with the actual user document in the result.

**Embedded array vs separate collection**: small things that belong to one parent and are always read together are embedded (budget `versions`, provider `packages`). Things queried on their own or growing without limit get their own collection (bookings, quotes).

**Index**: a sorted lookup structure that makes queries fast (`{ event: 1, status: 1 }`).
**Unique index**: the database refuses to insert a second document with the same value(s). Error code `11000` (duplicate key). We use this as a lock that can't be raced.
**Partial / sparse unique index**: uniqueness only applies to documents that match a filter (e.g. only where `dedupeKey` exists). Remove the field (`$unset`) and the "lock" is released, while the document itself stays.

**Atomic operation**: a single database operation on one document is all-or-nothing, and two of them on the same document never interleave halfway.

**Guarded (conditional) update with `findOneAndUpdate`**: put the business rule inside the *filter*:
```js
const listing = await SurplusListing.findOneAndUpdate(
  { _id: id, status: 'open', /* enough left? */ },
  { $inc: { quantityReserved: qty } },
  { returnDocument: 'after' }
);
if (!listing) throw httpError(409, 'Not enough food left');
```
Check and change happen in **one** atomic step. The naive version (read, check in JavaScript, then save) has a gap where another request can sneak in: a *race condition*. With the guard, if two coordinators reserve the last 20 portions at the same moment, exactly one succeeds.

**`$inc`, `$set`, `$push`, `$unset`, `$expr`**: update/query operators: add to a number, set fields, append to an array, remove a field, compare two fields of the same document inside a filter.

**Optimistic concurrency (version check)**: when saving an edit, include the version you started from in the filter (`{ _id, version: 3 }`). If someone else saved version 4 meanwhile, your update matches nothing and you get 409 "refresh and try again" instead of silently overwriting.

**Lazy expiry**: no timer closes expired listings. The rule is part of every query (`pickupDeadline: { $gt: now }`), and lists tidy up stale statuses when they're read. This is correct even on serverless.

## Correctness patterns

**Idempotency**: doing something twice has the same effect as doing it once. Needed because users double-click, networks retry, and payment gateways call callbacks more than once.
**Idempotency-Key**: the browser generates a random UUID when a form opens and sends it with the submit. The server stores it on the created record with a unique index; a repeat with the same key returns the existing record instead of creating another.

**Ledger**: a list of entries recording *why* a number is what it is (e.g. reward points: one entry per confirmed action). Totals are sums of entries, and corrections change the entry, so nothing is double-counted.

**Versioning**: we keep old versions instead of overwriting (budget versions, quote versions), so history and approvals stay auditable.

**Soft state instead of delete**: completed/cancelled records keep existing with a `status` and a reason. Only pure lock rows (`venueslots`) are deleted.

**Audit log**: an append-only collection recording who changed what, when and why.

## External APIs

**Timeout**: `fetch(url, { signal: AbortSignal.timeout(6000) })` gives up after 6 s instead of hanging the request.
**Fallback**: what the user can do when the API fails (manual address form, manual budget editor, dashboard task list, "pay later / record as pledged").
**Nominatim**: OpenStreetMap's free geocoder (address ⇄ coordinates). Policy: max 1 request/second, identify the app in `User-Agent`, no search-as-you-type.
**Telegram Bot API**: send messages through a bot via HTTPS (`sendMessage`). A user must message the bot first; we read that with `getUpdates` to learn their `chat_id`.
**Gemini API**: Google's LLM. We ask for JSON matching a schema, then label results "Estimate" and require approval.
**SSLCOMMERZ sandbox**: Bangladeshi payment gateway test mode. Flow: our server creates a session → browser goes to the gateway page → gateway POSTs back to our success URL → **our server asks the validation API** whether the payment is really valid before trusting it.

## Frontend

**Component**: a function returning JSX (UI). **Props**: inputs to a component. **State (`useState`)**: data that, when changed, re-renders the component. **Effect (`useEffect`)**: run code after render, e.g. fetch data.
**Context**: shares values (the logged-in user) with any component without passing props down manually.
**React Router**: maps browser URLs to page components; protected routes redirect to login when there is no user.
**Tailwind**: utility CSS classes in markup (`className="rounded-xl bg-card p-4"`). Responsive prefixes: `md:` applies from 768 px up.
**Leaflet**: map library; OpenStreetMap supplies the tiles (map images).
**Nested routes and `<Outlet />`**: in `App.jsx`, logged-in pages are children of the `<AppShell />` route. AppShell draws the sidebar and top bar, and `<Outlet />` is the spot where the current child page appears.
**Route guard**: a wrapper component (`RequireAuth`, `RequireRole`) that decides whether to show a page or redirect. It only affects the browser; the backend still checks everything.
**Custom hook**: a function starting with `use` that bundles state and effects for reuse, e.g. `useFetch(path)` returns `{ data, loading, error, reload }`.
**Effect cleanup**: the function returned from `useEffect` runs when the component disappears, e.g. `clearInterval` for the notification polling timer.
**Controlled input**: an input whose value comes from React state (`value={form.name}` + `onChange`), so React always knows what is typed.
**Vite dev proxy**: in development the React app (port 5173) calls `/api/...`, and Vite forwards it to Express (port 5000), so no CORS setup is needed locally.
**Design tokens**: named colours and fonts defined once in `client/src/index.css` (`@theme`). Change `--color-primary` there and every primary button changes.

## Tooling

**npm scripts**: shortcuts in `package.json` (`npm run dev`, `npm run seed`, `npm test`).
**`node --watch`**: restarts the server automatically when a file changes.
**Seed script**: inserts demo records into the database through the same Mongoose models the app uses. It is not hardcoding, because the UI still reads everything through the API.
**Vitest + Supertest + mongodb-memory-server**: Vitest runs the tests; Supertest sends HTTP requests to the Express app without opening a port; mongodb-memory-server starts a throwaway MongoDB for each test file.
**`returnDocument: 'after'`**: option for `findOneAndUpdate` that returns the document *after* the update (Mongoose 9's replacement for the older `new: true`).
**`select: false` / `.select('+field')`**: a schema field marked `select: false` (like `passwordHash`) is left out of query results unless a query explicitly asks for it with `+`.

## File uploads and maps (M1-B)

**multipart/form-data**: the request format browsers use to send files. Text fields and file bytes travel together in separate "parts". JSON can't carry raw files, which is why uploads use this format.
**FormData**: the browser object that builds a multipart request: `formData.append('file', file)`. Our `api.post` sees a FormData and leaves the `Content-Type` for the browser to set.
**multer**: Express middleware that reads multipart requests. `upload.single('file')` puts the bytes in `req.file.buffer` and the text fields in `req.body`; it also enforces the size and type limits.
**Buffer**: Node's type for raw bytes (a file's contents). Mongoose stores it as binary data in the document.
**Blob / object URL**: in the browser, a Blob is a chunk of downloaded bytes; `URL.createObjectURL(blob)` gives it a temporary `blob:` address that a tab can display. We use it to show protected PDFs that need the login token.
**Sub-document**: an object inside an array in a Mongoose document (each package in `provider.packages`). It gets its own `_id`, and `provider.packages.id(packageId)` finds it.
**Lazy check**: doing time-based work when someone looks instead of on a timer (e.g. the expiry check runs when an admin opens the review queue).
**Leaflet `divIcon`**: a map marker drawn with HTML/CSS instead of an image file; we use it for our own teal pin.
**OpenStreetMap tiles**: the map pictures Leaflet shows, downloaded from `tile.openstreetmap.org`; the attribution text in the corner is required.
**Escaping a regex**: user text used in a MongoDB `$regex` search has symbols like `.` or `*` escaped first, so "a.b" searches for the literal text and can't break the query.
