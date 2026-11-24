import { Router } from 'express';

import { authenticate } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import * as controller from './notifications.controller.js';
import * as schemas from './notifications.validation.js';

const router = Router();

router.get(
  '/notifications',
  authenticate,
  validate(schemas.listNotificationsQuerySchema, 'query'),
  controller.listNotifications,
);

router.patch(
  '/notifications/:id',
  authenticate,
  validate(schemas.updateNotificationParamsSchema, 'params'),
  validate(schemas.updateNotificationBodySchema),
  controller.updateNotification,
);
export default router;
