import { searchPlaces, reversePlace } from '../services/nominatim.service.js';
import { searchProviders } from '../services/providerSearch.service.js';

// GET /api/geo/search?q=dhanmondi: places in Bangladesh (Nominatim). On failure: 502 + manual fallback.
export async function geoSearch(req, res) {
  res.json({ places: await searchPlaces(req.validQuery.q) });
}

// GET /api/geo/reverse?lat=&lng=: the address at a corrected pin.
export async function geoReverse(req, res) {
  res.json({ place: await reversePlace(req.validQuery.lat, req.validQuery.lng) });
}

// POST /api/providers/search: up to 10 matching providers per category, with reasons and flags.
export async function providerSearch(req, res) {
  res.json({ criteria: req.body, results: await searchProviders(req.body) });
}
