import { ApiError } from '../../common/errors/api-error.js';
import { Product } from '../products/product.model.js';
import { Cart } from './cart.model.js';

export async function getCart({ userId }) {
  const cart = await Cart.findOne({ userId });
  const products = await Product.find({
    _id: { $in: (cart?.items || []).map((item) => item.productId) },
  });
  const items = (cart?.items || []).map((item) => ({
    product: products.find((product) => product.id === item.productId) || null,
    productId: item.productId,
    quantity: item.quantity,
  }));
  return {
    data: {
      items,
      total: items.reduce((sum, item) => sum + (item.product?.price || 0) * item.quantity, 0),
      currency: 'NGN',
    },
    meta: null,
  };
}

export async function replaceCart({ input, userId }) {
  for (const item of input.items) {
    if (
      !(await Product.exists({ _id: item.productId, active: true, stock: { $gte: item.quantity } }))
    )
      throw new ApiError(
        409,
        'INSUFFICIENT_STOCK',
        `Product ${item.productId} is unavailable in this quantity`,
      );
  }
  return {
    data: await Cart.findOneAndUpdate({ userId }, { $set: input }, { upsert: true, new: true }),
    meta: null,
  };
}
