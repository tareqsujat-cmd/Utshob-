# Walkthrough: M1-B Provider management
**Owner:** 23201544 (Tasmin Akter Ridita) · **Module 1 / Lab 5**

## 1. What it does (plain language)
Restaurants, caterers, venues and event planners create a **business profile**: category, description, location pin on a map, the divisions they serve, guest capacity, venue rules (outside catering allowed? setup and cleanup hours) and services such as halal or parking. They publish **packages with prices**, block **dates they are unavailable**, and upload **business documents** (trade licence, food safety or fire safety certificate) as PDF/PNG/JPG up to 1 MB.

An **administrator reviews each document** (approve, or reject with a reason). A provider is **bookable** only when:
1. the admin approved the provider's account, and
2. every document required for its category is **approved and not expired**:
   - venue: trade licence + fire safety
   - caterer/restaurant: trade licence + food safety
   - planner: trade licence

Hosts see a **public profile** listing exactly which documents were reviewed, when, and until when they are valid, with the note that this is **not a guarantee of food quality**. When a document **expires**, new bookings are blocked immediately (the rule compares dates every time), and the expiry check warns the provider once. M3-C later adds flagging of the provider's existing bookings to the same check.

## 2. File map
| File | Role |
|---|---|
| `server/models/ProviderProfile.js` | Profile + embedded `packages[]` and `blockedDates[]`; one per user (unique `user`) |
| `server/models/Credential.js` | One uploaded document + review status/reviewer/date/note |
| `server/models/File.js` | The uploaded bytes (`Buffer`), stored in MongoDB because Vercel has no disk |
| `server/config/constants.js` | Categories, credential types, **`REQUIRED_CREDENTIALS`**, tags, upload limits |
| `server/services/provider.service.js` | **`evaluateBookability`** (the rule), `bookabilityForMany`, `assertBookable` (used by M3-C), **`runExpiryCheck`** |
| `server/validators/m1b.providers.schemas.js` | zod rules: profile, package, blocked dates, credential upload, review |
| `server/middleware/upload.js` | multer: reads one file into memory, 1 MB, PDF/PNG/JPG only |
| `server/controllers/m1b.providers.controller.js` | Own profile, packages, blocked dates, public profile, directory |
| `server/controllers/m1b.credentials.controller.js` | Upload, list, file download, admin queue/review/expiry check |
| `server/routes/m1b.providers.routes.js` | `/api/providers/*`, `/api/files/:id`, `/api/admin/credentials/*` |
| `server/seed/data/providers.js` + `demoPdf.js` | 17 synthetic providers in all 8 divisions, each document a real tiny PDF |
| `server/tests/m1b.providers.test.js` | 10 tests (bookable rule, expiry, upload limits, review once, file privacy, public page) |
| `client/src/api/m1b.providers.api.js` | All write calls of this feature |
| `client/src/api/client.js` → `openFile` | Opens a protected file (needs the token) in a new tab |
| `client/src/components/MapPicker.jsx` | Leaflet map: click to place, drag to adjust, or read-only |
| `client/src/pages/m1b-providers/ProviderProfilePage.jsx` | Create/edit profile |
| `…/ProviderPackagesPage.jsx` | Packages list + add/edit modal + archive/restore |
| `…/ProviderAvailabilityPage.jsx` | Block/unblock dates |
| `…/ProviderCredentialsPage.jsx` | Required checklist, upload form, history |
| `…/AdminCredentialsPage.jsx` | Admin queue: open file, approve, reject with reason, run expiry check |
| `…/ProviderDirectoryPage.jsx` / `ProviderPublicPage.jsx` | What hosts see |
| `…/BookabilityPanel.jsx`, `credentialStatus.js` | Shared "can accept bookings?" box and status labels |

## 3. Request-to-database flow: uploading a trade licence
1. **ProviderCredentialsPage.jsx → `UploadForm.handleSubmit`**: checks a file is chosen and ≤ 1 MB, builds a `FormData` (type, number, dates, file).
2. **`providersApi.uploadCredential(formData)`** → `api.post('/providers/me/credentials', formData)`. `client.js` sees `FormData` and does **not** set JSON headers; the browser sends `multipart/form-data`.
3. **Route**: `requireAuth` → `requireRole('provider')` → **`upload.single('file')`** (multer reads the file into `req.file.buffer` and the text fields into `req.body`; rejects >1 MB or wrong type with 400) → `validate(credentialSchema)` (zod turns date strings into `Date`s; expiry must be after issue).
4. **`uploadCredential` controller**: finds the provider's profile → `File.create({ data: req.file.buffer, ... })` → `Credential.create({ status: 'pending', file: file._id, ... })`.
5. **MongoDB**: one `files` document (the bytes) + one `credentials` document pointing to it.
6. `logAudit(...)` + `notifyUsers(admins, 'New credential to review')`.
7. Response `201 { credential }` → the page shows "Uploaded…" and reloads the checklist ("Waiting for review").
8. **Admin** opens Credential reviews → `PATCH /api/admin/credentials/:id { status: 'approved' }` → guarded update → audit + notification to the provider → the provider's `bookability` turns green.

## 4. Key code, explained

### a) The bookable rule (`services/provider.service.js`)
```js
export function evaluateBookability(provider, user, credentials, now = new Date()) {
  const reasons = [];
  if (user.approvalStatus !== 'approved') reasons.push('Account not yet approved by an administrator');
  for (const type of REQUIRED_CREDENTIALS[provider.category]) {          // e.g. ['trade_licence', 'fire_safety']
    const ofType = credentials.filter((c) => c.type === type);
    if (ofType.some((c) => isCredentialValid(c, now))) continue;        // approved AND expiresAt > now
    const expired = ofType.find((c) => c.status === 'approved');         // approved once, now out of date
    if (expired) reasons.push(`${label} expired on ${day(expired.expiresAt)}`);
    else if (ofType.some((c) => c.status === 'pending')) reasons.push(`${label} is waiting for admin review`);
    else reasons.push(`${label} is missing (upload it under Credentials)`);
  }
  return { bookable: reasons.length === 0, reasons };
}
```
- It returns **reasons**, not just true/false, so every screen can explain *why*.
- Expiry needs no timer: the date is compared on every call, so an expired licence blocks bookings the moment it expires.
- One function is used by the provider dashboard, the public page, the directory and (in M3-C) `assertBookable` before a quote or booking.

### b) Guarded review: a document can be decided only once (`m1b.credentials.controller.js`)
```js
const credential = await Credential.findOneAndUpdate(
  { _id: req.params.id, status: 'pending' },                 // guard: still pending?
  { status, reviewNote: note, reviewedBy: req.user._id, reviewedAt: new Date() },
  { returnDocument: 'after' }
);
if (!credential) { /* 404 if it doesn't exist, 409 if someone already reviewed it */ }
```
Two admins clicking at the same moment: MongoDB applies one update first, and the second no longer matches `status: 'pending'`, so it gets `null` → 409.

### c) Upload limits (`middleware/upload.js`)
```js
export const upload = multer({
  storage: multer.memoryStorage(),                      // keep the file in RAM (req.file.buffer), no disk
  limits: { fileSize: UPLOAD_MAX_BYTES },               // 1 MB, larger -> MulterError LIMIT_FILE_SIZE -> 400
  fileFilter: (req, file, callback) => {
    if (UPLOAD_MIME_TYPES.includes(file.mimetype)) callback(null, true);
    else callback(httpError(400, 'Only PDF, PNG or JPG files are allowed'));
  },
});
```
The client checks size too (faster feedback), but only the server check counts.

### d) Expiry check: warn once, even if run twice (`runExpiryCheck`)
```js
const claimed = await Credential.findOneAndUpdate(
  { _id: credential._id, expiryNotifiedAt: null },   // not warned yet?
  { expiryNotifiedAt: now }
);
if (!claimed) continue;                               // another run already handled it
```
It runs when an admin opens the review page (lazy) or clicks "Run expiry check".

### e) Only the uploader or an admin can open a file (`downloadFile`)
```js
const file = await File.findById(req.params.id).select('+data');  // bytes are select:false by default
const allowed = file && (String(file.owner) === String(req.user._id) || req.user.role === 'admin');
if (!allowed) throw httpError(404, 'File not found');               // 404 hides that the file exists
```
In React, `openFile(fileId)` downloads with the token and shows the PDF from a temporary `blob:` URL, because a normal link cannot send the `Authorization` header.

## 5. Likely viva questions
1. **When is a provider allowed to take bookings?** Approved account + every required document for its category approved and unexpired. See `evaluateBookability`.
2. **How do expired documents block bookings without a scheduled job?** The rule compares `expiresAt > now` every time it runs, so expiry takes effect instantly. The expiry check only sends the one-time warning (and flags bookings in M3-C).
3. **Why store files in MongoDB, not on disk?** Vercel functions have no permanent disk. A 1 MB limit keeps documents small, well under MongoDB's 16 MB document limit.
4. **What stops two admins approving and rejecting the same document?** The guarded `findOneAndUpdate` with `status: 'pending'` in the filter; the loser gets 409.
5. **Why is the file route returning 404 instead of 403 to other users?** So nobody can discover which file ids exist.
6. **Why are packages archived instead of deleted?** Quotes and bookings (M3-C) may refer to a package; deleting would break history. The public page simply hides archived ones.
7. **What does the public page show about credentials, and what doesn't it claim?** Type, masked number, review date and expiry, plus a disclaimer that review is not a food-quality guarantee.
8. **How does multer fit with zod?** multer runs first because it parses the multipart body; then `validate` checks the text fields it produced.
9. **Why can a pending provider still edit its profile and upload documents?** The admin needs to see those documents to decide on the account; "bookable" is checked separately.
10. **Where is the list of required documents defined?** `REQUIRED_CREDENTIALS` in `server/config/constants.js`, sent to the client through `/api/meta`.

## 6. Live-modification drills

**Drill 1: Planners must also upload a food safety certificate.**
In `server/config/constants.js`: `planner: ['trade_licence', 'food_safety'],`. Nothing else changes: the rule, checklist and profile hint all read this list. (Seed planners will then show "Food safety certificate is missing".)

**Drill 2: Raise the upload limit to 2 MB and allow WebP images.**
`constants.js`: `UPLOAD_MAX_BYTES = 2 * 1024 * 1024` and add `'image/webp'` to `UPLOAD_MIME_TYPES`. Client: in `ProviderCredentialsPage.jsx` add `.webp` to `accept=` and change the "1 MB" texts (the size check already reads `meta.upload.maxBytes`). Also change the message in `errorHandler.js` (`'File is larger than 1 MB'`).

**Drill 3: Filter the directory to bookable providers only.**
`ProviderDirectoryPage.jsx`: add state `onlyBookable`, a `<Checkbox label="Only providers accepting bookings">`, and render `data.providers.filter((p) => !onlyBookable || p.bookable)`.
Server-side version: in `directory()` after computing `bookability`, `.filter((p) => bookability.get(String(p._id)).bookable)` when `req.validQuery.onlyBookable === 'true'` (add `onlyBookable: z.enum(['true','false']).optional()` to `directoryQuerySchema`).

## 7. 60-second demo script
1. Log in as **Nakshi Kitchen Caterers** (`pending.provider@utshob.demo` / `Demo@1234`). The dashboard says **"You cannot accept bookings yet"** and lists why.
2. **Packages & prices** → add a package → archive it (it disappears but is kept).
3. **Credentials** → upload a PDF (type "Other"), showing "Waiting for review".
4. Log in as **Admin** → **Credential reviews** → **Open** a PDF → **Approve** each → **Approvals** → approve Jahid Hasan's account.
5. Back as Nakshi: the dashboard now says **"You can accept quotes and bookings"**.
6. Log in as **host** → **Provider directory** → open **Sundarban Hall** (Khulna): **"Fire safety certificate expired…"**, not bookable, with the reviewed-credentials list and disclaimer.
