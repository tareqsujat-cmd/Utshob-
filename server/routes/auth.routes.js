import { Router } from 'express';
import * as auth from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimits.js';
import { signupSchema, loginSchema } from '../validators/auth.schemas.js';

const router = Router();

router.post('/signup', authLimiter, validate(signupSchema), auth.signup);
router.post('/login', authLimiter, validate(loginSchema), auth.login);
router.post('/logout', requireAuth, auth.logout);
router.get('/me', requireAuth, auth.me);

export default router;
