import { z } from 'zod';

import { empty, id, pagination } from '../../common/validation/schemas.js';

export const listFavoritesQuerySchema = pagination;

export const addFavoriteParamsSchema = z.strictObject({
  id: id.meta({
    description: 'Catalog ID of the active product to save to favorites.',
    example: 'PROD001',
  }),
});

export const addFavoriteBodySchema = empty;

export const removeFavoriteParamsSchema = z.strictObject({
  id: id.meta({
    description: 'Catalog ID of the product to remove from favorites.',
    example: 'PROD001',
  }),
});

export const removeFavoriteBodySchema = empty;
