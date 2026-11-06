# Walkthrough: M2-B Provider search (Nominatim API)
**Owner:** 23201544 (Tasmin Akter Ridita) · **Module 2 / Lab 6** · **External API: Nominatim (OpenStreetMap)**

## 1. What it does (plain language)
A host describes what they need and gets **up to 10 suitable registered providers per category** (venue, caterer, restaurant, planner), best first, each with **"why this matches"**.

- **Where:** type a place and press **Search**. Our server asks **Nominatim** (OpenStreetMap's free geocoder) for places in Bangladesh. Pick one and a pin appears on the map. **Confirm or correct**: drag the pin, or fix the division/district dropdowns. If Nominatim is down or finds nothing, a message appears and you **type the address manually** (the fields are always there).
- **What:** date, number of guests, kinds of providers with a **budget for each**, services they **must offer** (e.g. halal), and **nice-to-haves**. "Fill from my event" copies all this from an event, with budgets from its budget lines.
- **Hard rules** (provider is hidden, and the page says how many and why): not bookable (credentials not reviewed or expired), doesn't serve your division, blocked on your date, missing a required service.
- **Soft problems** (provider shown with a warning and ranked lower): over budget, **venue capacity conflict** (too small, or a minimum above your guest count), no package for your guest count, **outside-catering restriction** (a venue with in-house catering only; and when you choose such a venue, caterers are flagged).
- Each result shows the best-fitting package and its estimated cost, distance, **review count** (or "No reviews yet") and a **"Limited history"** label for providers with fewer than 3 completed bookings. When fewer than 10 match: "Only 4 venue option(s) match…". Results also appear on a **Leaflet map**.

## 2. File map
| File | Role |
|---|---|
| `server/services/nominatim.service.js` | **The external API**: `searchPlaces`, `reversePlace`; 1 request/second throttle, 24 h cache, 6 s timeout, `User-Agent`, name mapping (Chittagong → Chattogram …), 502 fallback |
| `server/services/providerSearch.service.js` | **`scoreProvider`** (hard rules → `null`, soft flags, reasons, score), `bestPackage`, **`searchProviders`** (per category, sort, top 10, note, excluded counts) |
| `server/services/provider.service.js → bookabilityForMany` | Reused from M1-B: who may take bookings |
| `server/services/surplus.service.js → distanceKm` | Reused from M1-C: haversine distance |
| `server/validators/m2b.search.schemas.js` | zod: geo search/reverse queries, search criteria |
| `server/controllers/m2b.search.controller.js` | Three small handlers |
| `server/routes/m2b.search.routes.js` | `GET /api/geo/search`, `GET /api/geo/reverse`, `POST /api/providers/search` |
| `server/tests/m2b.search.test.js` | 6 tests (Nominatim faked with `vi.spyOn(fetch)`) |
| `client/src/components/LocationSearch.jsx` | Search → pick → drag to correct → dropdowns/address (manual fallback) |
| `client/src/components/ResultsMap.jsx` | Numbered markers, fits all results |
| `client/src/pages/m2b-search/ProviderSearchPage.jsx` | Criteria form, "fill from my event", results per category, "Use as my venue" |

## 3. Request-to-database flow
**A) Finding the place**
1. LocationSearch → **Search** → `GET /api/geo/search?q=Dhanmondi 27` (`requireAuth`, zod: at least 3 letters).
2. `searchPlaces` → cache? → wait until 1 s since the last call → `fetch('https://nominatim.openstreetmap.org/search?q=…&countrycodes=bd&format=jsonv2&addressdetails=1', { User-Agent, timeout 6 s })`.
3. Each result → `toPlace`: `state: "Dhaka Division"` → `Dhaka`; `state_district/county` → district (aliases fix old spellings). Unknown names → `null` (user picks).
4. React lists the places → click → pin + dropdowns filled. Dragging the pin → `GET /api/geo/reverse` (best effort).

**B) Searching providers**
1. **Find providers** → `POST /api/providers/search` `{ location, date, guestCount, categories, budgets, services, preferences, venueId? }` → `requireRole('host','admin')` → `validate(providerSearchSchema)`.
2. `searchProviders`: approved provider accounts → their profiles in the requested categories → `bookabilityForMany` (2 queries) → the chosen venue (if any).
3. For each provider: **`scoreProvider`** → hard rule failed? count it in `excluded` and skip. Otherwise compute reasons, flags and score.
4. Per category: sort (no flags first, then score) → **top 10** → note if fewer.
5. Response `{ results: { venue: { results, totalMatched, note, excluded }, … } }` → cards + map.

## 4. Key code, explained

### a) Polite, cached, fail-safe API calls (`nominatim.service.js`)
```js
const wait = lastCallAt + 1000 - Date.now();                   // usage policy: max 1 request per second
if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
lastCallAt = Date.now();
try {
  response = await fetch(url, { headers: { 'User-Agent': env.nominatimUserAgent },   // identify our app (policy)
                                signal: AbortSignal.timeout(6000) });                // never hang
} catch (err) {
  throw httpError(502, 'Location search is not available right now. Enter the address manually.');
}
```
Plus `cached(key, load)`: the same query within 24 h is answered from memory, so Nominatim is not asked again. The UI turns the 502 into a yellow notice; the manual fields keep working.

### b) Mapping OSM names to ours (`toPlace`)
```js
const division = Object.keys(DIVISIONS).find((d) => d === cleanName(a.state)) || null;   // "Chittagong Division" -> "Chattogram"
const districtCandidates = [a.state_district, a.county, a.city, a.town].map(cleanName);
const district = division ? DIVISIONS[division].find((d) => districtCandidates.includes(d)) || null : null;
```
`cleanName` removes " Division"/" District" and applies `ALIASES`. If nothing matches we return `null` instead of guessing; that's why the user always **confirms** in the dropdowns.

### c) Hard rule vs soft flag (`scoreProvider`)
```js
let hardReason = null;
if (!bookable) hardReason = 'notBookable';
else if (!serves) hardReason = 'notServingArea';
else if (blocked) hardReason = 'unavailableOnDate';
else if (missing.length) hardReason = 'missingServices';
if (hardReason) { excluded[hardReason] += 1; return null; }     // hidden, but counted for the note
...
if (cap.max > 0 && criteria.guestCount > cap.max) {            // SOFT: shown with a warning
  score -= 30;
  flags.push(`Capacity conflict: holds up to ${cap.max}, you expect ${criteria.guestCount}`);
}
```
Hard rules are about **safety and possibility** (unreviewed credentials, wrong area, closed that day). Soft problems are **trade-offs** the host may accept (a bit over budget), so they're shown with the reason.

### d) Cost from real packages (`bestPackage`)
```js
.filter((p) => !p.isArchived && guestCount >= p.minGuests && guestCount <= p.maxGuests)
.map((p) => ({ package: p, cost: p.pricingType === 'per_guest' ? p.price * guestCount : p.price }))
```
Cheapest fitting package → "about ৳50,000 for your guests" (Bhoj: ৳250 × 200).

### e) Top 10 with clean results first (`searchProviders`)
```js
matches.sort((a, b) => (a.flags.length > 0) - (b.flags.length > 0) || b.score - a.score);
const top = matches.slice(0, MAX_PER_CATEGORY);          // 10
```
`(true) - (false)` is `1`, so a flagged result sorts after a clean one; for equal "flagged-ness" the higher score wins.

## 5. Likely viva questions
1. **Which external API does this feature use, and for what?** Nominatim (OpenStreetMap) to turn typed places into coordinates, and back (reverse) when the pin is moved.
2. **What does Nominatim's usage policy require, and how do you comply?** Max 1 request/second (the throttle), an identifying User-Agent, caching, and no search-as-you-type (we search only on the button).
3. **What happens if Nominatim is down?** 6 s timeout → 502 with "enter the address manually" → the UI shows a notice; dropdowns and the address field still work. Tested with a faked failing `fetch`.
4. **How can the user correct a wrong location?** Drag the pin (reverse lookup updates the address), and change the division/district dropdowns.
5. **Why not show providers whose credentials aren't reviewed?** Hosts must only be offered bookable providers (M1-B rule). They're counted in "Hidden: …".
6. **Hard rule vs soft flag?** Hard = impossible or unsafe (hidden). Soft = a trade-off (shown with a warning and ranked lower).
7. **How is the capacity check done?** Guest count vs `capacity.max`/`min` from the provider profile.
8. **How is the outside-catering restriction checked?** A venue with `allowsOutsideCatering: false` is flagged when you also look for caterers; after "Use as my venue", every caterer is flagged "X does not allow outside catering".
9. **What does "Limited history" mean?** Fewer than 3 completed bookings (`LIMITED_HISTORY_BELOW`), so there's little to judge by. Review count comes from M3-C reviews.
10. **Why "up to 10", and what if fewer match?** The spec. We show all that match and a note "Only N … match", plus why others were hidden.

## 6. Live-modification drills

**Drill 1: Show at most 5 results per category.**
`providerSearch.service.js`: `const MAX_PER_CATEGORY = 5;`

**Drill 2: Make "over budget" a hard rule (hide such providers).**
In `scoreProvider`, before the soft budget check:
```js
if (budget && best && best.cost > budget) { excluded.overBudget = (excluded.overBudget || 0) + 1; return null; }
```
and in `searchProviders`, add `overBudget: 0` to `excluded`; in `ProviderSearchPage.jsx` add `overBudget: 'over your budget'` to `EXCLUDED_TEXT`.

**Drill 3: Only search places in one division.**
`nominatim.service.js → searchPlaces`: call with `{ q: \`${q}, Dhaka\`, … }`, or add a `viewbox` param. Explain: we narrow Nominatim's search area.

## 7. 60-second demo script
Log in as **Event host** (`host@utshob.demo` / `Demo@1234`) → **Find providers**.
1. **Fill from my event → Wedding reception**: 200 guests, the date, venue ৳70,000 / caterer ৳55,000 / planner ৳15,000 budgets.
2. Type **"Dhanmondi 27"** → **Search** (live Nominatim) → pick the result → drag the pin a little → show division/district (confirm/correct).
3. **Find providers** → venue list: reasons (✓) and flags (⚠): Gulshan "over budget" + "in-house catering only"; the note "Only 4 venue options… Hidden: 1 without valid reviewed credentials; 2 don't serve this division"; the **map**.
4. Caterers: Mirpur Home Kitchen flagged "Capacity conflict: holds up to 120".
5. **Use as my venue** on Gulshan Grand Ballroom → caterers now flagged "Gulshan Grand Ballroom does not allow outside catering".
6. If asked about failure: the location search shows a yellow notice, and the address can be entered manually.
