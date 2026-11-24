import { ApiError } from '../errors/api-error.js';

export const validate =
  (schema, source = 'body') =>
  (req, res, next) => {
    const result = schema.safeParse(req[source] ?? {});
    if (!result.success)
      return next(
        new ApiError(
          422,
          'VALIDATION_ERROR',
          'Please correct the invalid fields',
          result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
        ),
      );
    req.validated ??= {};
    req.validated[source] = result.data;
    next();
  };
