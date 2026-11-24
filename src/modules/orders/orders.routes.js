import { Router } from 'express';

import { authenticate, admin, requireVerified } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import * as controller from './orders.controller.js';
import * as schemas from './orders.validation.js';

const router = Router();

router.post(
  '/orders',
  authenticate,
  requireVerified,
  validate(schemas.placeOrderBodySchema),
  controller.placeOrder,
);

router.get(
  '/orders',
  authenticate,
  validate(schemas.listOrdersQuerySchema, 'query'),
  controller.listOrders,
);

router.get(
  '/admin/orders',
  authenticate,
  admin,
  validate(schemas.listAdminOrdersQuerySchema, 'query'),
  controller.listAdminOrders,
);

router.get(
  '/orders/:id',
  authenticate,
  validate(schemas.getOrderParamsSchema, 'params'),
  controller.getOrder,
);

router.post(
  '/orders/:id/cancel',
  authenticate,
  validate(schemas.cancelOrderParamsSchema, 'params'),
  validate(schemas.cancelOrderBodySchema),
  controller.cancelOrder,
);

router.patch(
  '/admin/orders/:id/status',
  authenticate,
  admin,
  validate(schemas.updateOrderStatusParamsSchema, 'params'),
  validate(schemas.updateOrderStatusBodySchema),
  controller.updateOrderStatus,
);
export default router;
