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
    ...(item.size ? { size: item.size } : {}),
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

/** Throws the specific reason a cart line cannot be bought; shared with checkout. */
export function assertLineAvailable(product, { productId, size, quantity }) {
  if (!product?.active)
    throw new ApiError(409, 'INSUFFICIENT_STOCK', `Product ${productId} is unavailable`);
  const sized = product.sizes?.length > 0;
  if (sized && !size) throw new ApiError(422, 'SIZE_REQUIRED', `Choose a size for ${product.name}`);
  if (!sized && size)
    throw new ApiError(422, 'INVALID_SIZE', `${product.name} is not sold in sizes`);
  const available = sized ? product.sizes.find((entry) => entry.size === size) : product;
  if (!available)
    throw new ApiError(422, 'INVALID_SIZE', `${product.name} is not available in size ${size}`);
  if (available.stock < quantity)
    throw new ApiError(
      409,
      'INSUFFICIENT_STOCK',
      sized
        ? `${product.name} size ${size} is unavailable in this quantity`
        : `Product ${productId} is unavailable in this quantity`,
    );
}

export async function replaceCart({ input, userId }) {
  const products = await Product.find({
    _id: { $in: input.items.map((item) => item.productId) },
  });
  for (const item of input.items)
    assertLineAvailable(
      products.find((product) => product.id === item.productId),
      item,
    );
  return {
    data: await Cart.findOneAndUpdate({ userId }, { $set: input }, { upsert: true, new: true }),
    meta: null,
  };
}
