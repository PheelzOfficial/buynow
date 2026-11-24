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
app.use(
  cors({
    origin(origin, callback) {
      if (origin && !env.corsOrigins.includes(origin)) {
        return callback(new ApiError(403, 'CORS_DENIED', 'Origin is not allowed'));
      }
      callback(null, true);
    },
  }),
);
app.use(apiLimiter);
app.use(express.json({ limit: '100kb' }));
app.use('/api/v1', routes);
app.use((req, res, next) => next(new ApiError(404, 'NOT_FOUND', 'Endpoint not found')));
app.use(errorHandler);
export default app;
