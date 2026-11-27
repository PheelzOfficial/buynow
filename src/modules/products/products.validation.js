import { z } from 'zod';

import { id, pagination } from '../../common/validation/schemas.js';

const cloudImage = z.url().startsWith('https://res.cloudinary.com/').meta({
  description: 'HTTPS Cloudinary `url` returned by POST /uploads/image.',
  example: 'https://res.cloudinary.com/demo/image/upload/v1/buynow/phone-front.webp',
});

const productId = id.meta({
  description: 'Stable catalog ID of the product.',
  example: 'PROD001',
});

const productBody = z.strictObject({
  id: id.meta({
    description:
      'Permanent product ID you choose (letters, digits, _ or -, up to 80). Used in URLs, carts and orders; cannot be changed later.',
    example: 'PROD001',
  }),
  categoryId: id.meta({
    description: 'ID of an existing category this product belongs to.',
    example: 'electronics',
  }),
  name: z.string().trim().min(2).max(150).meta({
    description: 'Product title shown in listings, 2–150 characters.',
    example: 'Galaxy A55 128GB',
  }),
  description: z.string().trim().min(10).max(5000).meta({
    description: 'Full product details for the product page, 10–5000 characters.',
    example: '6.6-inch AMOLED display, 50MP camera, 5000mAh battery.',
  }),
  images: z.array(cloudImage).min(1).max(10).meta({
    description: 'Product photos in display order, 1–10. The first is the thumbnail.',
  }),
  price: z
    .number()
    .min(0)
    .max(1000000000)
    .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 0.00001, 'At most two decimal places')
    .meta({
      description: 'Unit price in Naira (NGN), not kobo. At most two decimal places.',
      example: 389999.99,
    }),
  stock: z.number().int().min(0).max(1000000).optional().meta({
    description:
      'Units available to sell, for products without sizes. 0 shows it as out of stock. Do not send it when `sizes` is used; it is then calculated as the sum of the size stocks.',
    example: 25,
  }),
  sizes: z
    .array(
      z.strictObject({
        size: z.string().trim().min(1).max(10).meta({
          description:
            'Size label shown to customers, e.g. EU shoe size "42" or clothing size "M".',
          example: '42',
        }),
        stock: z.number().int().min(0).max(1000000).meta({
          description: 'Units available in this size. 0 shows this size as sold out.',
          example: 10,
        }),
      }),
    )
    .min(1)
    .max(30)
    .refine(
      (list) => new Set(list.map((entry) => entry.size.toUpperCase())).size === list.length,
      'Each size may appear only once',
    )
    .optional()
    .meta({
      description:
        'Sizes the product is sold in, each with its own stock. Customers must then pick a size. Sending this replaces the whole size list.',
      example: [
        { size: '38', stock: 10 },
        { size: '39', stock: 5 },
        { size: '40', stock: 8 },
      ],
    }),
  colors: z
    .array(z.string().regex(/^#[0-9a-fA-F]{6}$/))
    .max(20)
    .default([])
    .meta({
      description: 'Available colour swatches as #RRGGBB hex codes, up to 20. Defaults to [].',
      example: ['#000000', '#1E90FF'],
    }),
  active: z.boolean().default(true).meta({
    description:
      'false hides the product from the catalog and checkout without deleting it. Defaults to true.',
    example: true,
  }),
});

const filters = pagination
  .extend({
    categoryId: id.optional().meta({
      description: 'Only return products in this category.',
      example: 'electronics',
    }),
    q: z.string().trim().min(1).max(100).optional().meta({
      description: 'Search text matched case-insensitively anywhere in the product name.',
      example: 'galaxy',
    }),
    minPrice: z.coerce.number().min(0).optional().meta({
      description: 'Lowest price to include, in NGN (inclusive).',
      example: 10000,
    }),
    maxPrice: z.coerce.number().min(0).optional().meta({
      description: 'Highest price to include, in NGN (inclusive). Must be ≥ minPrice.',
      example: 500000,
    }),
    minRating: z.coerce.number().min(0).max(5).optional().meta({
      description: 'Only products rated at least this, 0–5.',
      example: 4,
    }),
    inStock: z.enum(['true', 'false']).optional().meta({
      description: 'true: only products with stock > 0. false: only out-of-stock products.',
      example: 'true',
    }),
    sort: z.enum(['newest', 'oldest', 'price_asc', 'price_desc', 'rating']).default('newest').meta({
      description:
        'Result order: newest/oldest by creation date, price_asc/price_desc by price, rating highest first.',
      example: 'newest',
    }),
  })
  .refine((b) => b.minPrice === undefined || b.maxPrice === undefined || b.minPrice <= b.maxPrice, {
    path: ['maxPrice'],
    message: 'Must be at least minPrice',
  });

export const listProductsQuerySchema = filters;

export const getProductParamsSchema = z.strictObject({ id: productId });

const stockOrSizes = (body) => !(body.stock !== undefined && body.sizes !== undefined);
const stockOrSizesError = {
  path: ['stock'],
  message: 'Send either stock or sizes, not both; stock is calculated from sizes',
};

export const createProductBodySchema = productBody
  .refine(stockOrSizes, stockOrSizesError)
  .refine((b) => b.stock !== undefined || b.sizes !== undefined, {
    path: ['stock'],
    message: 'Provide stock, or sizes with a stock for each size',
  });

export const updateProductParamsSchema = z.strictObject({ id: productId });

export const updateProductBodySchema = productBody
  .omit({ id: true })
  .partial()
  .refine((b) => Object.keys(b).length > 0)
  .refine(stockOrSizes, stockOrSizesError);
