import mongoose from 'mongoose';

import { Product } from '../products/product.model.js';
import { Order } from './order.model.js';

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
  return result;
}
