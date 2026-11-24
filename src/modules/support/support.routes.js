import { Router } from 'express';

import { authenticate } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import * as controller from './support.controller.js';
import * as schemas from './support.validation.js';

const router = Router();

router.post(
  '/support',
  authenticate,
  validate(schemas.createTicketBodySchema),
  controller.createTicket,
);
export default router;
