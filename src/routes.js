import { Router } from 'express';

import addresses from './modules/addresses/addresses.routes.js';
import auth from './modules/auth/auth.routes.js';
import cart from './modules/cart/cart.routes.js';
import categories from './modules/categories/categories.routes.js';
import { env } from './config/env.js';
import docs from './modules/docs/docs.routes.js';
import favorites from './modules/favorites/favorites.routes.js';
import { getHealth } from './modules/health/health.controller.js';
import media from './modules/media/media.routes.js';
import notifications from './modules/notifications/notifications.routes.js';
import orders from './modules/orders/orders.routes.js';
import products from './modules/products/products.routes.js';
import support from './modules/support/support.routes.js';
import users from './modules/users/users.routes.js';

const router = Router();
router.get('/health', getHealth);
if (env.apiDocsEnabled) router.use(docs);
router.use('/auth', auth);
router.use('/me', users);
router.use(products, categories, media, addresses, cart, favorites, orders, notifications, support);
export default router;
