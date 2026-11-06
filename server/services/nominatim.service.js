// Nominatim = OpenStreetMap's free geocoder (address <-> coordinates).
// Usage policy we follow: max 1 request per second, identify the app in User-Agent,
// cache results, and search only when the user presses "Search" (no search-as-you-type).
import { env } from '../config/env.js';
import { DIVISIONS } from '../config/constants.js';
import { httpError } from '../utils/httpError.js';

const BASE = 'https://nominatim.openstreetmap.org';
const TIMEOUT_MS = 6000;
const CACHE_MS = 24 * 60 * 60 * 1000; // a day

const cache = new Map(); // "search:dhanmondi" -> { at, value }
let lastCallAt = 0;

// OSM sometimes uses older English spellings. Map them to the official names we use.
const ALIASES = {
  chittagong: 'Chattogram', barisal: 'Barishal', comilla: 'Cumilla', jessore: 'Jashore', bogra: 'Bogura',
  'chapai nawabganj': 'Chapainawabganj', nawabganj: 'Chapainawabganj', jhalakati: 'Jhalokati', moulvi_bazar: 'Moulvibazar',
  'moulvi bazar': 'Moulvibazar', netrakona: 'Netrokona', 'coxs bazar': "Cox's Bazar", "cox's bazar": "Cox's Bazar",
};

// "Chittagong Division" -> "Chattogram";  "Comilla District" -> "Cumilla"
function cleanName(raw) {
  if (!raw) return null;
  const base = raw.replace(/\s+(Division|District|Zila|City Corporation)$/i, '').trim();
  return ALIASES[base.toLowerCase()] || base;
}

// Turn a Nominatim result into our shape. Division/district are null when OSM's names don't match
// ours; the user then picks them from the dropdowns (the "correct" step).
function toPlace(result) {
  const a = result.address || {};
  const division = Object.keys(DIVISIONS).find((d) => d === cleanName(a.state)) || null;
  const districtCandidates = [a.state_district, a.county, a.city, a.town].map(cleanName);
  const district = division ? DIVISIONS[division].find((d) => districtCandidates.includes(d)) || null : null;
  return {
    displayName: result.display_name,
    lat: Number(Number(result.lat).toFixed(6)),
    lng: Number(Number(result.lon).toFixed(6)),
    division,
    district,
  };
}

// One polite request: waits so calls are at least 1 second apart, times out after 6 s.
async function callNominatim(path, params) {
  const wait = lastCallAt + 1000 - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastCallAt = Date.now();

  let response;
  try {
    response = await fetch(`${BASE}${path}?${new URLSearchParams({ ...params, format: 'jsonv2', addressdetails: '1' })}`, {
      headers: { 'User-Agent': env.nominatimUserAgent, 'Accept-Language': 'en' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    console.error('Nominatim unreachable:', err.message);
    throw httpError(502, 'Location search is not available right now. Enter the address manually.');
  }
  if (!response.ok) throw httpError(502, `Location search failed (${response.status}). Enter the address manually.`);
  return response.json();
}

async function cached(key, load) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  return value;
}

// Up to 5 places in Bangladesh matching the text.
export function searchPlaces(query) {
  const q = query.trim().toLowerCase();
  return cached(`search:${q}`, async () => {
    const results = await callNominatim('/search', { q, countrycodes: 'bd', limit: '5' });
    return results.map(toPlace);
  });
}

// The address at a point (used after the user drags the pin to correct it).
export function reversePlace(lat, lng) {
  return cached(`reverse:${lat.toFixed(4)},${lng.toFixed(4)}`, async () => {
    const result = await callNominatim('/reverse', { lat: String(lat), lon: String(lng) });
    if (!result || result.error) return null;
    return toPlace(result);
  });
}

// For tests: start with an empty cache.
export function clearGeoCache() {
  cache.clear();
  lastCallAt = 0;
}
