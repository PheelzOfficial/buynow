import crypto from 'node:crypto';

import { ApiError } from '../../common/errors/api-error.js';
import { missing } from '../../common/errors/not-found.js';
import {
  assertPaystackConfigured,
  initializeTransaction,
  isValidWebhookSignature,
  verifyTransaction,
} from '../../integrations/paystack/paystack.client.js';
import { Notification } from '../notifications/notification.model.js';
import { cancelAndRestock } from './order-cancellation.service.js';
import { Order } from './order.model.js';

// Order totals are computed from integer kobo, so this rounding is exact.
const toKobo = (naira) => Math.round(naira * 100);

/**
 * Returns the order with a Paystack checkout attached, creating one if needed. Safe to call
 * repeatedly: once a checkout is stored it is reused, and concurrent callers converge on one.
 */
export async function ensurePaymentSession(order, email) {
  if (order.payment?.authorizationUrl) return order;
  const checkout = await initializeTransaction({
    email,
    amountKobo: toKobo(order.total),
    // A fresh reference per attempt: Paystack rejects reused references.
    reference: `BN_${order.id}_${crypto.randomBytes(4).toString('hex')}`,
    metadata: { orderId: order.id },
  });
  const updated = await Order.findOneAndUpdate(
    { _id: order._id, 'payment.authorizationUrl': { $exists: false } },
    {
      $set: {
        'payment.reference': checkout.reference,
        'payment.authorizationUrl': checkout.authorizationUrl,
        'payment.accessCode': checkout.accessCode,
      },
    },
    { new: true },
  );
  return updated ?? (await Order.findById(order._id));
}

export async function startPayment({ resourceId, userId, email }) {
  const order = await Order.findOne({ _id: resourceId, userId });
  if (!order) throw missing();
  if (order.paymentMethod !== 'paystack')
    throw new ApiError(409, 'PAYMENT_NOT_REQUIRED', 'This order is paid on delivery');
  if (order.paymentStatus !== 'unpaid')
    throw new ApiError(409, 'ORDER_ALREADY_PAID', 'This order has already been paid');
  if (order.status !== 'pending' || order.payment?.expiresAt <= new Date())
    throw new ApiError(
      409,
      'ORDER_NOT_PAYABLE',
      'This order expired or was cancelled. Place a new order.',
    );
  assertPaystackConfigured();
  return { data: await ensurePaymentSession(order, email), meta: null };
}

/**
 * Marks the order paid if, and only if, Paystack itself reports a successful charge for the full
 * amount. Idempotent. Returns null for references that belong to no order.
 */
export async function confirmPaystackPayment(reference) {
  const order = await Order.findOne({ 'payment.reference': reference });
  if (!order) return null;
  if (order.paymentStatus !== 'unpaid') return order;

  const transaction = await verifyTransaction(reference);
  if (transaction?.status !== 'success') return order;
  if (transaction.amountKobo !== toKobo(order.total) || transaction.currency !== 'NGN') {
    console.error(JSON.stringify({ event: 'PAYMENT_MISMATCH', orderId: order.id, reference }));
    throw new ApiError(
      409,
      'PAYMENT_MISMATCH',
      'The payment does not match this order. Contact support.',
    );
  }

  const paymentFields = {
    'payment.paidAt': transaction.paidAt ? new Date(transaction.paidAt) : new Date(),
    'payment.channel': transaction.channel,
  };
  const paid = await Order.findOneAndUpdate(
    { _id: order._id, paymentStatus: 'unpaid', status: { $ne: 'cancelled' } },
    { $set: { paymentStatus: 'paid', ...paymentFields } },
    { new: true },
  );
  if (paid) {
    await Notification.create({
      userId: paid.userId,
      title: 'Payment received',
      message: `Payment for order ${paid.id} was confirmed.`,
    });
    return paid;
  }
  // The money arrived after the order expired or was cancelled and its stock was released.
  const late = await Order.findOneAndUpdate(
    { _id: order._id, paymentStatus: 'unpaid', status: 'cancelled' },
    { $set: { paymentStatus: 'refund_due', ...paymentFields } },
    { new: true },
  );
  if (late) {
    console.error(JSON.stringify({ event: 'REFUND_DUE', orderId: late.id, reference }));
    await Notification.create({
      userId: late.userId,
      title: 'Payment received after expiry',
      message: `Order ${late.id} had already expired, so your payment will be refunded.`,
    });
    return late;
  }
  return Order.findById(order._id);
}

export async function verifyPayment({ resourceId, userId }) {
  const order = await Order.findOne({ _id: resourceId, userId });
  if (!order) throw missing();
  if (order.paymentMethod !== 'paystack')
    throw new ApiError(409, 'PAYMENT_NOT_REQUIRED', 'This order is paid on delivery');
  if (!order.payment?.reference || order.paymentStatus !== 'unpaid')
    return { data: order, meta: null };
  return { data: await confirmPaystackPayment(order.payment.reference), meta: null };
}

export async function handlePaystackWebhook({ rawBody, signature, event }) {
  if (!isValidWebhookSignature(rawBody, signature))
    throw new ApiError(401, 'INVALID_SIGNATURE', 'Webhook signature is invalid');
  if (event?.event !== 'charge.success' || typeof event.data?.reference !== 'string') return;
  try {
    await confirmPaystackPayment(event.data.reference);
  } catch (error) {
    // A mismatch will never resolve by retrying; it is logged for manual review. Anything else
    // (provider or database outage) propagates as 5xx so Paystack retries the webhook.
    if (error.code !== 'PAYMENT_MISMATCH') throw error;
  }
}

/**
 * Releases stock held by Paystack orders that were not paid in time. Each order is re-checked
 * with Paystack first, so a payment that did go through is recorded instead of cancelled.
 */
export async function expireUnpaidOrders(now = new Date()) {
  const due = await Order.find({
    paymentMethod: 'paystack',
    paymentStatus: 'unpaid',
    status: 'pending',
    'payment.expiresAt': { $lte: now },
  }).limit(50);
  let expired = 0;
  for (const order of due) {
    try {
      if (order.payment?.reference) {
        const settled = await confirmPaystackPayment(order.payment.reference);
        if (settled && settled.paymentStatus !== 'unpaid') continue;
      }
      const cancelled = await cancelAndRestock({ _id: order._id });
      if (cancelled) {
        expired += 1;
        await Notification.create({
          userId: cancelled.userId,
          title: 'Order expired',
          message: `Order ${cancelled.id} was cancelled because payment was not completed.`,
        });
      }
    } catch (error) {
      console.error(
        JSON.stringify({ event: 'ORDER_EXPIRY_FAILED', orderId: order.id, code: error.code }),
      );
    }
  }
  return expired;
}
