import jwt from 'jsonwebtoken';

import { env } from '../../config/env.js';
import { User } from '../../modules/users/user.model.js';
import { ApiError } from '../errors/api-error.js';

export const authenticate = async (req, res, next) => {
  try {
    const bearer = req.headers.authorization;
    if (!bearer?.startsWith('Bearer ')) throw new ApiError(401, 'UNAUTHORIZED', 'Please sign in');
    const payload = jwt.verify(bearer.slice(7), env.jwtSecret, {
      algorithms: ['HS256'],
      issuer: 'buynow',
      audience: 'buynow-app',
    });
    const user = await User.findById(payload.sub);
    if (!user || user.tokenVersion !== payload.version)
      throw new ApiError(401, 'UNAUTHORIZED', 'Your session is no longer valid');
    req.user = user;
    next();
  } catch (e) {
    next(e);
  }
};

export const admin = (req, res, next) =>
  req.user.role === 'admin'
    ? next()
    : next(new ApiError(403, 'FORBIDDEN', 'Administrator access required'));

export const requireVerified = (req, res, next) =>
  req.user.verified
    ? next()
    : next(new ApiError(403, 'EMAIL_NOT_VERIFIED', 'Verify your email first'));
