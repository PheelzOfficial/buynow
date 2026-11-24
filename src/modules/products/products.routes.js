import { Router } from 'express';

import { authenticate, admin } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import * as controller from './products.controller.js';
import * as schemas from './products.validation.js';

const router = Router();

router.get(
  '/products',
  validate(schemas.listProductsQuerySchema, 'query'),
  controller.listProducts,
);

router.get(
  '/products/:id',
  validate(schemas.getProductParamsSchema, 'params'),
  controller.getProduct,
);

router.post(
  '/admin/products',
  authenticate,
  admin,
  validate(schemas.createProductBodySchema),
  controller.createProduct,
);

router.patch(
  '/admin/products/:id',
  authenticate,
  admin,
  validate(schemas.updateProductParamsSchema, 'params'),
  validate(schemas.updateProductBodySchema),
  controller.updateProduct,
);
export default router;
