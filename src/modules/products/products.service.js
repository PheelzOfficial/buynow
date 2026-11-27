import { ApiError } from '../../common/errors/api-error.js';
import { pageMeta } from '../../common/utils/pagination.js';
import { Category } from '../categories/category.model.js';
import { Product } from './product.model.js';

export async function listProducts({ filters }) {
  const query = filters,
    criteria = { active: true };
  if (query.categoryId) criteria.categoryId = query.categoryId;
  if (query.q)
    criteria.name = { $regex: query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  if (query.minPrice !== undefined || query.maxPrice !== undefined)
    criteria.price = {
      ...(query.minPrice !== undefined ? { $gte: query.minPrice } : {}),
      ...(query.maxPrice !== undefined ? { $lte: query.maxPrice } : {}),
    };
  if (query.minRating !== undefined) criteria.ratings = { $gte: query.minRating };
  if (query.inStock) criteria.stock = query.inStock === 'true' ? { $gt: 0 } : 0;
  const sorts = {
    newest: { createdAt: -1, _id: 1 },
    oldest: { createdAt: 1, _id: 1 },
    price_asc: { price: 1, _id: 1 },
    price_desc: { price: -1, _id: 1 },
    rating: { ratings: -1, _id: 1 },
  };
  const [items, total] = await Promise.all([
    Product.find(criteria)
      .sort(sorts[query.sort])
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    Product.countDocuments(criteria),
  ]);
  return { data: items, meta: pageMeta({ page: query.page, limit: query.limit }, total) };
}

export async function getProduct({ resourceId }) {
  const product = await Product.findOne({ _id: resourceId, active: true });
  if (!product) throw new ApiError(404, 'NOT_FOUND', 'Product not found');
  return { data: product, meta: null };
}

// A sized product's total stock is derived, never entered, so the two cannot disagree.
const totalOf = (sizes) => sizes.reduce((sum, entry) => sum + entry.stock, 0);

export async function createProduct({ input }) {
  const { id: productId, ...attributes } = input;
  if (!(await Category.exists({ _id: attributes.categoryId })))
    throw new ApiError(422, 'INVALID_CATEGORY', 'Category does not exist');
  if (attributes.sizes) attributes.stock = totalOf(attributes.sizes);
  return { data: await Product.create({ _id: productId, ...attributes }), meta: null };
}

export async function updateProduct({ input, resourceId }) {
  const changes = { ...input };
  if (changes.categoryId && !(await Category.exists({ _id: changes.categoryId })))
    throw new ApiError(422, 'INVALID_CATEGORY', 'Category does not exist');
  if (changes.sizes) changes.stock = totalOf(changes.sizes);
  else if (
    changes.stock !== undefined &&
    (await Product.exists({ _id: resourceId, 'sizes.0': { $exists: true } }))
  )
    throw new ApiError(
      422,
      'SIZED_PRODUCT_STOCK',
      'This product has sizes; update stock per size with `sizes`',
    );
  const product = await Product.findByIdAndUpdate(
    resourceId,
    { $set: changes },
    { new: true, runValidators: true },
  );
  if (!product) throw new ApiError(404, 'NOT_FOUND', 'Product not found');
  return { data: product, meta: null };
}
