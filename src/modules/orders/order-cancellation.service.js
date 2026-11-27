import mongoose from 'mongoose';

import { Product } from '../products/product.model.js';
import { Order } from './order.model.js';

/** Puts an order line's units back, on its size as well as the product total. */
async function restoreStock({ productId, size, quantity }, session) {
  if (size) {
    const restored = await Product.updateOne(
      { _id: productId, 'sizes.size': size },
      { $inc: { 'sizes.$.stock': quantity, stock: quantity } },
      { session },
    );
    if (restored.matchedCount) return;
    // The admin removed this size since the order; re-add it so the units are not lost.
    const readded = await Product.updateOne(
      { _id: productId, 'sizes.0': { $exists: true } },
      { $push: { sizes: { size, stock: quantity } }, $inc: { stock: quantity } },
      { session },
    );
    if (readded.matchedCount) return;
  }
  await Product.updateOne({ _id: productId }, { $inc: { stock: quantity } }, { session });
}

/**
 * Atomically cancels one pending, unpaid order matching `criteria` and returns its reserved stock.
 * Returns the cancelled order, or null when nothing matched (already cancelled, paid or moved on).
 * The paymentStatus guard means a payment confirmed at the same moment always wins over cancellation.
 */
export async function cancelAndRestock(criteria) {
  let result = null;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      result = await Order.findOneAndUpdate(
        { ...criteria, status: 'pending', paymentStatus: 'unpaid' },
        { $set: { status: 'cancelled' } },
        { new: true, session },
      );
      if (!result) return;
      for (const item of result.items) await restoreStock(item, session);
    });
  } finally {
    await session.endSession();
  }
  return result;
}
