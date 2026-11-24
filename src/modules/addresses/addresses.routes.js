import { Router } from 'express';

import { authenticate } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import * as controller from './addresses.controller.js';
import * as schemas from './addresses.validation.js';

const router = Router();

router.get('/addresses', authenticate, controller.listAddresses);

router.post(
  '/addresses',
  authenticate,
  validate(schemas.createAddressBodySchema),
  controller.createAddress,
);

router.patch(
  '/addresses/:id',
  authenticate,
  validate(schemas.updateAddressParamsSchema, 'params'),
  validate(schemas.updateAddressBodySchema),
  controller.updateAddress,
);

router.delete(
  '/addresses/:id',
  authenticate,
  validate(schemas.deleteAddressParamsSchema, 'params'),
  validate(schemas.deleteAddressBodySchema),
  controller.deleteAddress,
);
export default router;
