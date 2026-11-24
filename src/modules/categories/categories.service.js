import { ApiError } from '../../common/errors/api-error.js';
import { pageMeta } from '../../common/utils/pagination.js';
import { Product } from '../products/product.model.js';
import { Category } from './category.model.js';

export async function listCategories({ filters }) {
  const query = filters;
  const [categories, total, counts] = await Promise.all([
    Category.find()
      .sort({ _id: 1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    Category.countDocuments(),
    Product.aggregate([
      { $match: { active: true } },
      { $group: { _id: '$categoryId', total: { $sum: 1 } } },
    ]),
  ]);
  return {
    data: categories.map((category) => ({
      ...category.toJSON(),
      total: counts.find((count) => count._id === category.id)?.total || 0,
    })),
    meta: pageMeta(query, total),
  };
}

export async function createCategory({ input }) {
  const { id: categoryId, ...attributes } = input;
  return { data: await Category.create({ _id: categoryId, ...attributes }), meta: null };
}

export async function updateCategory({ input, resourceId }) {
  const category = await Category.findByIdAndUpdate(
    resourceId,
    { $set: input },
    { new: true, runValidators: true },
  );
  if (!category) throw new ApiError(404, 'NOT_FOUND', 'Category not found');
  return { data: category, meta: null };
}
