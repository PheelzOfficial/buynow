import { Router } from 'express';

import { authenticate } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import * as controller from './cart.controller.js';
import * as schemas from './cart.validation.js';

const router = Router();

router.get('/cart', authenticate, controller.getCart);

router.put('/cart', authenticate, validate(schemas.replaceCartBodySchema), controller.replaceCart);
export default router;
