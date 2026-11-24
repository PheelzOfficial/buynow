import mongoose from 'mongoose';

import { ApiError } from '../../common/errors/api-error.js';
import { missing } from '../../common/errors/not-found.js';
import { pageMeta } from '../../common/utils/pagination.js';
import { Address } from '../addresses/address.model.js';
import { Cart } from '../cart/cart.model.js';
import { Notification } from '../notifications/notification.model.js';
import { Product } from '../products/product.model.js';
import { Order } from './order.model.js';

export async function placeOrder({ input, userId }) {
  const checkout = input;
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
        const product = await Product.findOneAndUpdate(
          { _id: item.productId, active: true, stock: { $gte: item.quantity } },
          { $inc: { stock: -item.quantity } },
          { new: true, session },
        );
        if (!product)
          throw new ApiError(
            409,
            'INSUFFICIENT_STOCK',
            `Product ${item.productId} is unavailable in this quantity`,
          );
        items.push({
          productId: product.id,
          name: product.name,
          image: product.images[0],
          quantity: item.quantity,
          unitPrice: product.price,
        });
        cents += Math.round(product.price * 100) * item.quantity;
      }
      [result] = await Order.create(
        [{ userId, ...checkout, address: address.toJSON(), items, total: cents / 100 }],
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
  let result;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      result = await Order.findOneAndUpdate(
        { _id: resourceId, userId, status: 'pending' },
        { $set: { status: 'cancelled' } },
        { new: true, session },
      );
      if (!result)
        throw new ApiError(
          409,
          'ORDER_NOT_CANCELLABLE',
          'Only your pending orders can be cancelled',
        );
      for (const item of result.items)
        await Product.updateOne(
          { _id: item.productId },
          { $inc: { stock: item.quantity } },
          { session },
        );
    });
  } finally {
    await session.endSession();
  }
  return { data: result, meta: null };
}

export async function updateOrderStatus({ input, resourceId }) {
  const target = input.status,
    previous = { processing: 'pending', shipped: 'processing', delivered: 'shipped' }[target];
  const order = await Order.findOneAndUpdate(
    { _id: resourceId, status: previous },
    { $set: { status: target, ...(target === 'delivered' ? { paymentStatus: 'paid' } : {}) } },
    { new: true },
  );
  if (!order)
    throw new ApiError(409, 'INVALID_ORDER_TRANSITION', 'Order cannot move to that status');
  return { data: order, meta: null };
}
