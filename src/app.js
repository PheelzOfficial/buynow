import cors from 'cors';
import express from 'express';
import helmet from 'helmet';

import { ApiError } from './common/errors/api-error.js';
import { errorHandler } from './common/middleware/error-handler.js';
import { apiLimiter } from './common/middleware/rate-limit.js';
import { requestContext } from './common/middleware/request-context.js';
import { env } from './config/env.js';
import routes from './routes.js';

export const app = express();
app.disable('x-powered-by');
if (env.trustProxy !== undefined) app.set('trust proxy', env.trustProxy);
app.use(requestContext);
app.use(helmet());
// Same-origin requests (e.g. Swagger UI served by this API) are always allowed: browsers send an
// Origin header on same-origin POST/PATCH/PUT/DELETE too. A cross-site page cannot forge its
// Origin, so matching it against this request's Host only ever admits our own pages.
const isSameOrigin = (origin, host) => {
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
};
app.use(
  cors((req, callback) => {
    const { origin, host } = req.headers;
    if (origin && !isSameOrigin(origin, host) && !env.corsOrigins.includes(origin)) {
      return callback(new ApiError(403, 'CORS_DENIED', 'Origin is not allowed'));
    }
    callback(null, { origin: true });
  }),
);
app.use(apiLimiter);
app.use(
  express.json({
    limit: '100kb',
    // Webhook signatures are computed over the exact bytes received, not re-serialized JSON.
    verify: (req, res, buffer) => {
      req.rawBody = buffer;
    },
  }),
);
app.use('/api/v1', routes);
app.use((req, res, next) => next(new ApiError(404, 'NOT_FOUND', 'Endpoint not found')));
app.use(errorHandler);
export default app;
