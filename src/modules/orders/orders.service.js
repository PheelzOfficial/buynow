import mongoose from 'mongoose';

import { ApiError } from '../../common/errors/api-error.js';
import { missing } from '../../common/errors/not-found.js';
import { pageMeta } from '../../common/utils/pagination.js';
import { env } from '../../config/env.js';
import { assertPaystackConfigured } from '../../integrations/paystack/paystack.client.js';
import { Address } from '../addresses/address.model.js';
import { Cart } from '../cart/cart.model.js';
import { assertLineAvailable } from '../cart/cart.service.js';
import { Notification } from '../notifications/notification.model.js';
import { Product } from '../products/product.model.js';
import { cancelAndRestock } from './order-cancellation.service.js';
import { ensurePaymentSession } from './order-payments.service.js';
import { Order } from './order.model.js';

export async function placeOrder({ input, userId, email }) {
  const checkout = input;
  const online = checkout.paymentMethod === 'paystack';
  // Fail before reserving stock if online payment cannot work at all.
  if (online) assertPaystackConfigured();
  let result;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const existing = await Order.findOne({
        userId,
        idempotencyKey: checkout.idempotencyKey,
      }).session(session);
      if (existing) {
        result = existing;
        return;
      }
      const address = await Address.findOne({ _id: checkout.addressId, userId }).session(session);
      if (!address) throw missing();
      const cart = await Cart.findOne({ userId }).session(session);
      if (!cart?.items.length)
        throw new ApiError(400, 'EMPTY_CART', 'Add products to your cart first');
      const items = [];
      let cents = 0;
      for (const item of cart.items) {
        const quantity = item.quantity;
        // Sized lines take stock from that size and the product total in one atomic update;
        // unsized lines only match products that still have no sizes.
        const product = await Product.findOneAndUpdate(
          item.size
            ? {
                _id: item.productId,
                active: true,
                sizes: { $elemMatch: { size: item.size, stock: { $gte: quantity } } },
              }
            : {
                _id: item.productId,
                active: true,
                stock: { $gte: quantity },
                'sizes.0': { $exists: false },
              },
          item.size
            ? { $inc: { 'sizes.$.stock': -quantity, stock: -quantity } }
            : { $inc: { stock: -quantity } },
          { new: true, session },
        );
        if (!product) {
          // Explain why (size now required, size removed, or sold out); aborts the transaction.
          assertLineAvailable(await Product.findById(item.productId).session(session), item);
          throw new ApiError(
            409,
            'INSUFFICIENT_STOCK',
            `Product ${item.productId} is unavailable in this quantity`,
          );
        }
        items.push({
          productId: product.id,
          name: product.name,
          image: product.images[0],
          ...(item.size ? { size: item.size } : {}),
          quantity,
          unitPrice: product.price,
        });
        cents += Math.round(product.price * 100) * item.quantity;
      }
      const payment = online
        ? { expiresAt: new Date(Date.now() + env.paystack.orderTtlMinutes * 60000) }
        : undefined;
      [result] = await Order.create(
        [{ userId, ...checkout, address: address.toJSON(), items, total: cents / 100, payment }],
        { session },
      );
      await Cart.updateOne({ _id: cart._id }, { $set: { items: [] } }, { session });
      await Notification.create(
        [
          {
            userId,
            title: 'Order received',
            message: `Order ${result.id} was placed.`,
          },
        ],
        { session },
      );
    });
  } finally {
    await session.endSession();
  }
  // Outside the transaction: never hold database locks while waiting on Paystack. If this fails,
  // the client retries POST /orders with the same idempotencyKey (or POST /orders/:id/payment).
  // Decided by the stored order, not the request: a replayed key may carry a different method.
  if (
    result.paymentMethod === 'paystack' &&
    result.paymentStatus === 'unpaid' &&
    result.status === 'pending'
  )
    result = await ensurePaymentSession(result, email);
  return { data: result, meta: null };
}

async function findOrders(filters, scope) {
  const criteria = { ...scope, ...(filters.status ? { status: filters.status } : {}) };
  const [items, total] = await Promise.all([
    Order.find(criteria)
      .sort({ _id: -1 })
      .skip((filters.page - 1) * filters.limit)
      .limit(filters.limit),
    Order.countDocuments(criteria),
  ]);
  return { data: items, meta: pageMeta({ page: filters.page, limit: filters.limit }, total) };
}

export async function listOrders({ filters, userId }) {
  return findOrders(filters, { userId });
}

export async function listAdminOrders({ filters }) {
  return findOrders(filters, {});
}

export async function getOrder({ resourceId, userId }) {
  const order = await Order.findOne({ _id: resourceId, userId });
  if (!order) throw missing();
  return { data: order, meta: null };
}

export async function cancelOrder({ resourceId, userId }) {
  // Paid orders need a refund, so customers cannot cancel them directly.
  const result = await cancelAndRestock({ _id: resourceId, userId });
  if (!result)
    throw new ApiError(
      409,
      'ORDER_NOT_CANCELLABLE',
      'Only your pending, unpaid orders can be cancelled',
    );
  return { data: result, meta: null };
}

export async function updateOrderStatus({ input, resourceId }) {
  const target = input.status,
    previous = { processing: 'pending', shipped: 'processing', delivered: 'shipped' }[target];
  // Online orders must be paid before fulfilment starts; cash orders are paid on delivery.
  const paidOrCash = { $or: [{ paymentMethod: { $ne: 'paystack' } }, { paymentStatus: 'paid' }] };
  const order = await Order.findOneAndUpdate(
    { _id: resourceId, status: previous, ...paidOrCash },
    { $set: { status: target, ...(target === 'delivered' ? { paymentStatus: 'paid' } : {}) } },
    { new: true },
  );
  if (!order) {
    const unpaid = await Order.exists({ _id: resourceId, status: previous });
    if (unpaid)
      throw new ApiError(409, 'PAYMENT_REQUIRED', 'This order has not been paid online yet');
    throw new ApiError(409, 'INVALID_ORDER_TRANSITION', 'Order cannot move to that status');
  }
  return { data: order, meta: null };
}
