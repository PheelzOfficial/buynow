import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';

import { buildOpenApiDocument } from './openapi.js';

const document = buildOpenApiDocument();
const router = Router();

router.get('/openapi.json', (req, res) => res.json(document));
router.use(
  '/docs',
  swaggerUi.serve,
  swaggerUi.setup(document, {
    customSiteTitle: 'BuyNow API',
    swaggerOptions: { persistAuthorization: true },
  }),
);
export default router;
