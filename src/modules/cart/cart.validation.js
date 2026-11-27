import { z } from 'zod';

import { id } from '../../common/validation/schemas.js';

export const replaceCartBodySchema = z.strictObject({
  items: z
    .array(
      z.strictObject({
        productId: id.meta({
          description: 'Catalog ID of an active product (the `id` from GET /products).',
          example: 'PROD006',
        }),
        size: z.string().trim().min(1).max(10).optional().meta({
          description:
            'Required for products that have `sizes`, and must be one of them exactly as listed (e.g. "42"). Omit it for products without sizes.',
          example: '42',
        }),
        quantity: z.number().int().min(1).max(99).meta({
          description: 'Number of units, 1–99. Must not exceed the stock of the chosen size.',
          example: 2,
        }),
      }),
    )
    .max(100)
    .refine(
      (a) => new Set(a.map((i) => `${i.productId}\u0000${i.size ?? ''}`)).size === a.length,
      'Each product and size combination may appear only once',
    )
    .meta({
      description:
        'The complete new cart contents; replaces whatever was there. The same product may appear once per size. Send [] to empty the cart.',
    }),
});
