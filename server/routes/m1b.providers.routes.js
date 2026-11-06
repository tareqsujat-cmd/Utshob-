import { Router } from 'express';
import * as providers from '../controllers/m1b.providers.controller.js';
import * as credentials from '../controllers/m1b.credentials.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { upload } from '../middleware/upload.js';
import {
  profileSchema,
  packageSchema,
  blockedDatesSchema,
  credentialSchema,
  credentialReviewSchema,
  credentialQuerySchema,
  directoryQuerySchema,
} from '../validators/m1b.providers.schemas.js';

// M1-B Provider management
// Providers may build their profile and upload documents while their account is still pending:
// the admin needs to see those documents to decide. "Bookable" is checked separately.
const providerOnly = [requireAuth, requireRole('provider')];

// /api/providers
export const providersRouter = Router();
providersRouter.get('/me', providerOnly, providers.getMine);
providersRouter.put('/me', providerOnly, validate(profileSchema), providers.saveMine);
providersRouter.post('/me/packages', providerOnly, validate(packageSchema), providers.addPackage);
providersRouter.patch('/me/packages/:packageId', providerOnly, validate(packageSchema), providers.updatePackage);
providersRouter.put('/me/blocked-dates', providerOnly, validate(blockedDatesSchema), providers.saveBlockedDates);
// upload.single('file') must run BEFORE validate: multer is what reads the multipart form fields.
providersRouter.post('/me/credentials', providerOnly, upload.single('file'), validate(credentialSchema), credentials.uploadCredential);
providersRouter.get('/me/credentials', providerOnly, credentials.listMine);
providersRouter.get('/', requireAuth, validate(directoryQuerySchema, 'query'), providers.directory);
providersRouter.get('/:id', requireAuth, providers.getPublic); // keep after the /me routes

// /api/files
export const filesRouter = Router();
filesRouter.get('/:id', requireAuth, credentials.downloadFile);

// /api/admin/credentials
export const adminCredentialsRouter = Router();
adminCredentialsRouter.use(requireAuth, requireRole('admin'));
adminCredentialsRouter.get('/', validate(credentialQuerySchema, 'query'), credentials.adminList);
adminCredentialsRouter.post('/expiry-check', credentials.adminExpiryCheck);
adminCredentialsRouter.patch('/:id', validate(credentialReviewSchema), credentials.adminReview);
