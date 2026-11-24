import { ok } from '../../common/http/response.js';
import * as service from './cart.service.js';

export async function getCart(req, res) {
  const result = await service.getCart({ userId: req.user._id });
  return ok(res, result.data, 'Request successful', 200, result.meta);
}

export async function replaceCart(req, res) {
  const result = await service.replaceCart({ input: req.validated.body, userId: req.user._id });
  return ok(res, result.data, 'Cart updated', 200, result.meta);
}
