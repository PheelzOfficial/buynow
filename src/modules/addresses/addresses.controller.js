import { ok } from '../../common/http/response.js';
import * as service from './addresses.service.js';

export async function listAddresses(req, res) {
  const result = await service.listAddresses({ userId: req.user._id });
  return ok(res, result.data, 'Request successful', 200, result.meta);
}

export async function createAddress(req, res) {
  const result = await service.createAddress({ input: req.validated.body, userId: req.user._id });
  return ok(res, result.data, 'Address created', 201, result.meta);
}

export async function updateAddress(req, res) {
  const result = await service.updateAddress({
    input: req.validated.body,
    resourceId: req.params.id,
    userId: req.user._id,
  });
  return ok(res, result.data, 'Address updated', 200, result.meta);
}

export async function deleteAddress(req, res) {
  const result = await service.deleteAddress({ resourceId: req.params.id, userId: req.user._id });
  return ok(res, result.data, 'Address deleted', 200, result.meta);
}
