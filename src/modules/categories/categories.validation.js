import { z } from 'zod';

import { id, pagination } from '../../common/validation/schemas.js';

const cloudImage = z.url().startsWith('https://res.cloudinary.com/').meta({
  description:
    'Category tile image. Must be the HTTPS Cloudinary `url` returned by POST /uploads/image.',
  example: 'https://res.cloudinary.com/demo/image/upload/v1/buynow/electronics.webp',
});

const categoryName = z.string().trim().min(2).max(100).meta({
  description: 'Display name shown on the category grid, 2–100 characters.',
  example: 'Electronics',
});

export const listCategoriesQuerySchema = pagination;

export const createCategoryBodySchema = z.strictObject({
  id: id.meta({
    description:
      'Permanent category ID you choose (letters, digits, _ or -, up to 80). Products reference it as `categoryId`; it cannot be changed later.',
    example: 'electronics',
  }),
  name: categoryName,
  image: cloudImage,
});

export const updateCategoryParamsSchema = z.strictObject({
  id: id.meta({ description: 'ID of the category to update.', example: 'electronics' }),
});

export const updateCategoryBodySchema = z
  .strictObject({
    name: categoryName.optional(),
    image: cloudImage.optional(),
  })
  .refine((b) => Object.keys(b).length > 0);
