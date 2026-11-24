import { z } from 'zod';

import { empty, pagination, objectId } from '../../common/validation/schemas.js';

const orderId = objectId.meta({
  description: 'Order ID (the `id` returned when the order was placed or listed).',
  example: '665f1c2e9b1d4a3f8c7e2a11',
});

const statusFilter = z
  .enum(['pending', 'processing', 'shipped', 'delivered', 'cancelled'])
  .optional()
  .meta({ description: 'Only return orders currently in this status.', example: 'pending' });

export const placeOrderBodySchema = z.strictObject({
  addressId: objectId.meta({
    description: 'ID of one of your saved addresses to ship to (from GET /addresses).',
    example: '665f1c2e9b1d4a3f8c7e2a10',
  }),
  paymentMethod: z.literal('cash_on_delivery').meta({
    description: 'How the order is paid. Only cash_on_delivery is supported.',
    example: 'cash_on_delivery',
  }),
  idempotencyKey: z.string().uuid().meta({
    description:
      'A UUID you generate once per checkout attempt. Resend the same key on network retries so the order is not placed twice; use a new key for a new order.',
    example: '3f1c2b9e-7a4d-4e8b-9c1a-2d5e6f7a8b90',
  }),
});

export const listOrdersQuerySchema = pagination.extend({ status: statusFilter });

export const listAdminOrdersQuerySchema = pagination.extend({ status: statusFilter });

export const getOrderParamsSchema = z.strictObject({ id: orderId });

export const cancelOrderParamsSchema = z.strictObject({ id: orderId });

export const cancelOrderBodySchema = empty;

export const updateOrderStatusParamsSchema = z.strictObject({ id: orderId });

export const updateOrderStatusBodySchema = z.strictObject({
  status: z.enum(['processing', 'shipped', 'delivered']).meta({
    description:
      'Next fulfillment step. Must follow pending → processing → shipped → delivered with no skipping. delivered also marks the cash payment as collected.',
    example: 'processing',
  }),
});
