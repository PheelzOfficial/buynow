import { z } from 'zod';

export const empty = z.strictObject({});

export const password = z
  .string()
  .min(12)
  .max(72)
  .regex(/[a-z]/, 'Include a lowercase letter')
  .regex(/[A-Z]/, 'Include an uppercase letter')
  .regex(/[0-9]/, 'Include a number')
  .refine(
    (value) => Buffer.byteLength(value, 'utf8') <= 72,
    'Password must be at most 72 UTF-8 bytes',
  );

export const email = z
  .email()
  .max(254)
  .transform((s) => s.toLowerCase());

export const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);

export const pagination = z.strictObject({
  page: z.coerce.number().int().min(1).max(10000).default(1).meta({
    description: 'Which page of results to return, starting at 1.',
    example: 1,
  }),
  limit: z.coerce.number().int().min(1).max(100).default(20).meta({
    description: 'How many results per page, 1–100.',
    example: 20,
  }),
});

export const objectId = z.string().regex(/^[a-fA-F0-9]{24}$/);
