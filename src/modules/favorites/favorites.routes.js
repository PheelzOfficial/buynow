import { Router } from 'express';

import { authenticate } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import * as controller from './favorites.controller.js';
import * as schemas from './favorites.validation.js';

const router = Router();

router.get(
  '/favorites',
  authenticate,
  validate(schemas.listFavoritesQuerySchema, 'query'),
  controller.listFavorites,
);

router.put(
  '/favorites/:id',
  authenticate,
  validate(schemas.addFavoriteParamsSchema, 'params'),
  validate(schemas.addFavoriteBodySchema),
  controller.addFavorite,
);

router.delete(
  '/favorites/:id',
  authenticate,
  validate(schemas.removeFavoriteParamsSchema, 'params'),
  validate(schemas.removeFavoriteBodySchema),
  controller.removeFavorite,
);
export default router;
