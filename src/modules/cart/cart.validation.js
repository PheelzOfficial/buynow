import { z } from 'zod';

import { id } from '../../common/validation/schemas.js';

export const replaceCartBodySchema = z.strictObject({
  items: z
    .array(
      z.strictObject({
        productId: id.meta({
          description: 'Catalog ID of an active product (the `id` from GET /products).',
          example: 'PROD001',
        }),
        quantity: z.number().int().min(1).max(99).meta({
          description: 'Number of units, 1–99. Must not exceed current stock.',
          example: 2,
        }),
      }),
    )
    .max(100)
    .refine(
      (a) => new Set(a.map((i) => i.productId)).size === a.length,
      'Duplicate products are not allowed',
    )
    .meta({
      description:
        'The complete new cart contents; replaces whatever was there. Each product may appear once. Send [] to empty the cart.',
    }),
});
