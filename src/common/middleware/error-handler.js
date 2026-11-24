import { z } from 'zod';

import { ApiError } from '../errors/api-error.js';

export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  let status = err.status || 500,
    code = err.code || 'INTERNAL_ERROR',
    message = err.message,
    details = err.details || [];
  if (err instanceof z.ZodError) {
    status = 422;
    code = 'VALIDATION_ERROR';
    message = 'Invalid request';
  } else if (err.code === 11000) {
    status = 409;
    code = 'CONFLICT';
    message = 'A record with these unique fields already exists';
    details = Object.keys(err.keyPattern || {}).map((field) => ({
      field,
      message: 'Already in use',
    }));
  } else if (err.name === 'ValidationError' || err.name === 'CastError') {
    status = 422;
    code = 'VALIDATION_ERROR';
    message = 'Invalid data supplied';
  } else if (['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError'].includes(err.name)) {
    status = 401;
    code = 'INVALID_TOKEN';
    message = 'Your session is invalid or expired';
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    code = 'INVALID_JSON';
    message = 'Request body must contain valid JSON';
  } else if (err.type === 'entity.too.large' || err.code === 'LIMIT_FILE_SIZE') {
    status = 413;
    code = 'PAYLOAD_TOO_LARGE';
    message = 'Request exceeds the permitted size';
  } else if (err.name === 'MulterError') {
    status = 400;
    code = 'INVALID_UPLOAD';
    message = 'Upload one image in the image field';
  } else if (
    ['MongoServerSelectionError', 'MongoNetworkError', 'MongooseServerSelectionError'].includes(
      err.name,
    )
  ) {
    status = 503;
    code = 'DATABASE_UNAVAILABLE';
    message = 'Database temporarily unavailable';
  }
  if (status >= 500 && !(err instanceof ApiError)) {
    message = 'An unexpected server error occurred';
    code = status === 503 ? code : 'INTERNAL_ERROR';
  }
  if (status >= 500)
    console.error(JSON.stringify({ requestId: res.locals.requestId, code, type: err.name }));
  res.status(status).json({
    success: false,
    message,
    data: null,
    error: { code, details },
    meta: null,
    requestId: res.locals.requestId,
  });
}
