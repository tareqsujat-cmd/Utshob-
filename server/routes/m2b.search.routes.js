import { Router } from 'express';
import * as search from '../controllers/m2b.search.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { geoSearchSchema, geoReverseSchema, providerSearchSchema } from '../validators/m2b.search.schemas.js';

// M2-B Provider search (Nominatim + matching).
const searchers = [requireAuth, requireRole('host', 'admin')];

// /api/geo: any logged-in user may look up places (also used by other forms).
export const geoRouter = Router();
geoRouter.get('/search', requireAuth, validate(geoSearchSchema, 'query'), search.geoSearch);
geoRouter.get('/reverse', requireAuth, validate(geoReverseSchema, 'query'), search.geoReverse);

// /api/providers/search (POST: the criteria are an object, not a few query words)
export const providerSearchRouter = Router();
providerSearchRouter.post('/search', searchers, validate(providerSearchSchema), search.providerSearch);
