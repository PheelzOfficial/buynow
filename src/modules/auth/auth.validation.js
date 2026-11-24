import { z } from 'zod';

import { empty, password, email } from '../../common/validation/schemas.js';

const accountEmail = email.meta({
  description: 'Email address of the account. Case-insensitive; stored lowercase.',
  example: 'customer@example.com',
});

const otp = z
  .string()
  .regex(/^\d{6}$/)
  .meta({
    description:
      'Six-digit code from the email, sent as a string so leading zeros are kept. Valid 10 minutes, 5 attempts.',
    example: '048213',
  });

const newPassword = password.meta({
  description:
    'New password: 12–72 characters (max 72 UTF-8 bytes) with at least one lowercase letter, one uppercase letter and one digit. Not trimmed.',
  example: 'ExampleNewPass123',
});

const reset = z
  .strictObject({
    email: accountEmail,
    otp,
    newPassword,
    confirmPassword: password.meta({
      description: 'Must be exactly the same as `newPassword`.',
      example: 'ExampleNewPass123',
    }),
  })
  .refine((b) => b.newPassword === b.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords must match',
  });

export const registerBodySchema = z.strictObject({
  username: z.string().trim().min(2).max(60).meta({
    description: 'Display name shown in the app, 2–60 characters. Not used to sign in.',
    example: 'Adaeze',
  }),
  email: email.meta({
    description: 'Login email; must not already be registered. Verification codes are sent here.',
    example: 'customer@example.com',
  }),
  password: password.meta({
    description:
      'Account password: 12–72 characters (max 72 UTF-8 bytes) with at least one lowercase letter, one uppercase letter and one digit.',
    example: 'SecureExample123',
  }),
  phone: z
    .string()
    .regex(/^\+?[1-9]\d{7,14}$/)
    .optional()
    .meta({
      description:
        'Optional contact number: optional leading +, 8–15 digits, no spaces. Not a login identifier.',
      example: '+2348012345678',
    }),
});

export const loginBodySchema = z.strictObject({
  email: accountEmail,
  password: z.string().min(1).max(72).meta({
    description: 'The account’s current password.',
    example: 'SecureExample123',
  }),
});

export const forgotPasswordBodySchema = z.strictObject({
  email: email.meta({
    description:
      'Email of the account to reset. The response is identical whether or not the account exists.',
    example: 'customer@example.com',
  }),
});

export const resendVerificationBodySchema = z.strictObject({
  email: email.meta({
    description: 'Email of the unverified account that should receive a new verification code.',
    example: 'customer@example.com',
  }),
});

export const verifyEmailBodySchema = z.strictObject({ email: accountEmail, otp });

export const resetPasswordBodySchema = reset;

export const logoutBodySchema = empty;
