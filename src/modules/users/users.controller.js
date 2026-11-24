import { ok } from '../../common/http/response.js';
import * as service from './users.service.js';

export async function getProfile(req, res) {
  const result = await service.getProfile({ user: req.user });
  return ok(res, result.data, 'Request successful', 200, result.meta);
}

export async function updateProfile(req, res) {
  const result = await service.updateProfile({ input: req.validated.body, userId: req.user._id });
  return ok(res, result.data, 'Profile updated', 200, result.meta);
}

export async function changePassword(req, res) {
  const result = await service.changePassword({ input: req.validated.body, userId: req.user._id });
  return ok(res, result.data, 'Password changed. Please sign in again', 200, result.meta);
}
