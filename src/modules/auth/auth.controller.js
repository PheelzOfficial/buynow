import { ok } from '../../common/http/response.js';
import * as service from './auth.service.js';

export async function register(req, res) {
  const result = await service.register({ input: req.validated.body });
  return ok(
    res,
    result.data,
    'Account created. Request an email verification code.',
    201,
    result.meta,
  );
}

export async function login(req, res) {
  const result = await service.login({ input: req.validated.body });
  return ok(res, result.data, 'Signed in', 200, result.meta);
}

export async function forgotPassword(req, res) {
  const result = await service.forgotPassword({ input: req.validated.body });
  return ok(res, result.data, 'If the account is eligible, a code has been sent', 200, result.meta);
}

export async function resendVerification(req, res) {
  const result = await service.resendVerification({ input: req.validated.body });
  return ok(res, result.data, 'If the account is eligible, a code has been sent', 200, result.meta);
}

export async function verifyEmail(req, res) {
  const result = await service.verifyEmail({ input: req.validated.body });
  return ok(res, result.data, 'Email verified', 200, result.meta);
}

export async function resetPassword(req, res) {
  const result = await service.resetPassword({ input: req.validated.body });
  return ok(res, result.data, 'Password reset. Please sign in again', 200, result.meta);
}

export async function logout(req, res) {
  const result = await service.logout({ userId: req.user._id });
  return ok(res, result.data, 'All sessions signed out', 200, result.meta);
}
