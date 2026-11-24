import crypto from 'node:crypto';

export const requestContext = (req, res, next) => {
  res.locals.requestId = crypto.randomUUID();
  res.set('X-Request-Id', res.locals.requestId);
  next();
};
