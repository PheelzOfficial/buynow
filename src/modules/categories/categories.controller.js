import { ok } from '../../common/http/response.js';
import * as service from './categories.service.js';

export async function listCategories(req, res) {
  const result = await service.listCategories({ filters: req.validated.query });
  return ok(res, result.data, 'Categories fetched', 200, result.meta);
}

export async function createCategory(req, res) {
  const result = await service.createCategory({ input: req.validated.body });
  return ok(res, result.data, 'Category created', 201, result.meta);
}

export async function updateCategory(req, res) {
  const result = await service.updateCategory({
    input: req.validated.body,
    resourceId: req.params.id,
  });
  return ok(res, result.data, 'Category updated', 200, result.meta);
}
