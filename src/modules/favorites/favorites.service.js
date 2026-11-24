import { missing } from '../../common/errors/not-found.js';
import { pageMeta } from '../../common/utils/pagination.js';
import { Product } from '../products/product.model.js';
import { Favorite } from './favorite.model.js';

export async function listFavorites({ filters, userId }) {
  const query = filters,
    criteria = { userId };
  const [items, total] = await Promise.all([
    Favorite.find(criteria)
      .sort({ _id: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    Favorite.countDocuments(criteria),
  ]);
  return {
    data: await Product.find({ _id: { $in: items.map((item) => item.productId) }, active: true }),
    meta: pageMeta(query, total),
  };
}

export async function addFavorite({ resourceId, userId }) {
  if (!(await Product.exists({ _id: resourceId, active: true }))) throw missing();
  await Favorite.updateOne(
    { userId, productId: resourceId },
    { $setOnInsert: { userId, productId: resourceId } },
    { upsert: true },
  );
  return { data: null, meta: null };
}

export async function removeFavorite({ resourceId, userId }) {
  await Favorite.deleteOne({ userId, productId: resourceId });
  return { data: null, meta: null };
}
