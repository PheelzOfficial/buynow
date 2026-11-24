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

router.post(
  '/orders/:id/payment',
  authenticate,
  validate(schemas.startPaymentParamsSchema, 'params'),
  validate(schemas.startPaymentBodySchema),
  controller.startPayment,
);

router.post(
  '/orders/:id/payment/verify',
  authenticate,
  validate(schemas.verifyPaymentParamsSchema, 'params'),
  validate(schemas.verifyPaymentBodySchema),
  controller.verifyPayment,
);

// Called by Paystack, not the app. Authenticated by the HMAC signature instead of a token.
router.post('/payments/paystack/webhook', controller.paystackWebhook);

router.patch(
  '/admin/orders/:id/status',
  authenticate,
  admin,
  validate(schemas.updateOrderStatusParamsSchema, 'params'),
  validate(schemas.updateOrderStatusBodySchema),
  controller.updateOrderStatus,
);
export default router;
