import { z } from 'zod';

import { empty, objectId } from '../../common/validation/schemas.js';

const addressBody = z.strictObject({
  name: z.string().trim().min(2).max(100).meta({
    description:
      'Full name of the person receiving the delivery (may differ from the account holder).',
    example: 'Adaeze Okafor',
  }),
  phone: z
    .string()
    .regex(/^\+?[1-9]\d{7,14}$/)
    .meta({
      description:
        'Phone number the courier calls on delivery. Digits only with optional leading +, 8–15 digits, no spaces or dashes. International format recommended.',
      example: '+2348012345678',
    }),
  line1: z.string().trim().min(3).max(200).meta({
    description: 'Primary street address: house/building number and street name.',
    example: '12 Admiralty Way',
  }),
  line2: z.string().trim().max(200).optional().meta({
    description: 'Optional extra details: apartment, floor, landmark or estate name.',
    example: 'Flat 3B, behind Mega Plaza',
  }),
  city: z.string().trim().min(2).max(100).meta({
    description: 'City or town.',
    example: 'Lekki',
  }),
  state: z.string().trim().min(2).max(100).meta({
    description: 'State, province or region.',
    example: 'Lagos',
  }),
  postalCode: z.string().trim().min(2).max(20).meta({
    description: 'Postal/ZIP code. Sent as a string so leading zeros are preserved.',
    example: '106104',
  }),
  country: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .meta({
      description: 'ISO 3166-1 alpha-2 country code, two uppercase letters.',
      example: 'NG',
    }),
});

const addressId = objectId.meta({
  description:
    'ID of one of your saved addresses (from GET /addresses). Another user’s ID returns 404.',
  example: '665f1c2e9b1d4a3f8c7e2a10',
});

export const createAddressBodySchema = addressBody;

export const updateAddressParamsSchema = z.strictObject({ id: addressId });

export const updateAddressBodySchema = addressBody
  .partial()
  .refine((b) => Object.keys(b).length > 0);

export const deleteAddressParamsSchema = z.strictObject({ id: addressId });

export const deleteAddressBodySchema = empty;
