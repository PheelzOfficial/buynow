import { z } from 'zod';

import { password } from '../../common/validation/schemas.js';

export const updateProfileBodySchema = z
  .strictObject({
    username: z.string().trim().min(2).max(60).optional().meta({
      description: 'New display name, 2–60 characters.',
      example: 'Adaeze O.',
    }),
    phone: z
      .string()
      .regex(/^\+?[1-9]\d{7,14}$/)
      .optional()
      .meta({
        description: 'Contact number: optional leading +, 8–15 digits, no spaces.',
        example: '+2348012345678',
      }),
    avatar: z.url().startsWith('https://res.cloudinary.com/').optional().meta({
      description:
        'Profile picture. Upload via POST /uploads/image first, then send the returned HTTPS Cloudinary `url`.',
      example: 'https://res.cloudinary.com/demo/image/upload/v1/buynow/avatar.webp',
    }),
    preferences: z
      .strictObject({
        language: z.enum(['en', 'fr', 'es']).optional().meta({
          description: 'Preferred app language: en (English), fr (French) or es (Spanish).',
          example: 'en',
        }),
        notifications: z.boolean().optional().meta({
          description: 'Whether the user wants to receive notifications.',
          example: true,
        }),
      })
      .optional()
      .meta({
        description:
          'App settings. Only the keys you send are changed; the rest keep their current values.',
      }),
  })
  .refine((b) => Object.keys(b).length > 0, 'Provide at least one field');

export const changePasswordBodySchema = z
  .strictObject({
    currentPassword: z.string().min(1).max(72).meta({
      description: 'The password the user signs in with today.',
      example: 'SecureExample123',
    }),
    newPassword: password.meta({
      description:
        'Replacement password: 12–72 characters with a lowercase letter, an uppercase letter and a digit. Must differ from the current one.',
      example: 'ExampleNewPass123',
    }),
    confirmPassword: password.meta({
      description: 'Must be exactly the same as `newPassword`.',
      example: 'ExampleNewPass123',
    }),
  })
  .refine((b) => b.newPassword === b.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords must match',
  })
  .refine((b) => b.currentPassword !== b.newPassword, {
    path: ['newPassword'],
    message: 'Choose a different password',
  });
