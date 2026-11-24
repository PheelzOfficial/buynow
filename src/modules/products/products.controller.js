import { ok } from '../../common/http/response.js';
import * as service from './products.service.js';

export async function listProducts(req, res) {
  const result = await service.listProducts({ filters: req.validated.query });
  return ok(res, result.data, 'Products fetched', 200, result.meta);
}

export async function getProduct(req, res) {
  const result = await service.getProduct({ resourceId: req.params.id });
  return ok(res, result.data, 'Request successful', 200, result.meta);
}

export async function createProduct(req, res) {
  const result = await service.createProduct({ input: req.validated.body });
  return ok(res, result.data, 'Product created', 201, result.meta);
}

export async function updateProduct(req, res) {
  const result = await service.updateProduct({
    input: req.validated.body,
    resourceId: req.params.id,
  });
  return ok(res, result.data, 'Product updated', 200, result.meta);
}
