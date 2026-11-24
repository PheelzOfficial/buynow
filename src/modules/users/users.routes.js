import { Router } from 'express';

import { authenticate } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import * as controller from './users.controller.js';
import * as schemas from './users.validation.js';

const router = Router();
router.use(authenticate);
router.get('/', controller.getProfile);

router.patch('/', validate(schemas.updateProfileBodySchema), controller.updateProfile);

router.post(
  '/change-password',
  validate(schemas.changePasswordBodySchema),
  controller.changePassword,
);
export default router;
