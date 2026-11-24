import { Router } from 'express';

import { authenticate, admin } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import * as controller from './categories.controller.js';
import * as schemas from './categories.validation.js';

const router = Router();

router.get(
  '/categories',
  validate(schemas.listCategoriesQuerySchema, 'query'),
  controller.listCategories,
);

router.post(
  '/admin/categories',
  authenticate,
  admin,
  validate(schemas.createCategoryBodySchema),
  controller.createCategory,
);

router.patch(
  '/admin/categories/:id',
  authenticate,
  admin,
  validate(schemas.updateCategoryParamsSchema, 'params'),
  validate(schemas.updateCategoryBodySchema),
  controller.updateCategory,
);
export default router;
