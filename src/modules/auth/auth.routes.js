import { Router } from 'express';

import { authenticate } from '../../common/middleware/authenticate.js';
import { authLimiter } from '../../common/middleware/rate-limit.js';
import { validate } from '../../common/middleware/validate.js';
import * as controller from './auth.controller.js';
import * as schemas from './auth.validation.js';

const router = Router();
router.use(authLimiter);
router.post('/register', validate(schemas.registerBodySchema), controller.register);

router.post('/login', validate(schemas.loginBodySchema), controller.login);

router.post(
  '/forgot-password',
  validate(schemas.forgotPasswordBodySchema),
  controller.forgotPassword,
);

router.post(
  '/resend-verification',
  validate(schemas.resendVerificationBodySchema),
  controller.resendVerification,
);

router.post('/verify', validate(schemas.verifyEmailBodySchema), controller.verifyEmail);

router.post('/reset-password', validate(schemas.resetPasswordBodySchema), controller.resetPassword);

router.post('/logout', authenticate, validate(schemas.logoutBodySchema), controller.logout);
export default router;
