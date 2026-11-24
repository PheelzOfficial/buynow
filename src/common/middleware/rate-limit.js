import { rateLimit } from 'express-rate-limit';

import { ApiError } from '../errors/api-error.js';

export const apiLimiter = rateLimit({
  windowMs: 60000,
  limit: 120,
  handler: (req, res, next) =>
    next(new ApiError(429, 'RATE_LIMITED', 'Too many requests. Try again shortly.')),
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  handler: (req, res, next) =>
    next(new ApiError(429, 'RATE_LIMITED', 'Too many authentication attempts. Try again later.')),
});
