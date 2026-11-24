import { ok } from '../../common/http/response.js';
import * as payments from './order-payments.service.js';
import * as service from './orders.service.js';

export async function placeOrder(req, res) {
  const result = await service.placeOrder({
    input: req.validated.body,
    userId: req.user._id,
    email: req.user.email,
  });
  return ok(res, result.data, 'Order placed', 201, result.meta);
}

export async function startPayment(req, res) {
  const result = await payments.startPayment({
    resourceId: req.params.id,
    userId: req.user._id,
    email: req.user.email,
  });
  return ok(res, result.data, 'Payment ready', 200, result.meta);
}

export async function verifyPayment(req, res) {
  const result = await payments.verifyPayment({ resourceId: req.params.id, userId: req.user._id });
  const message =
    result.data.paymentStatus === 'paid' ? 'Payment confirmed' : 'Payment not completed yet';
  return ok(res, result.data, message, 200, result.meta);
}

export async function paystackWebhook(req, res) {
  await payments.handlePaystackWebhook({
    rawBody: req.rawBody,
    signature: req.get('x-paystack-signature'),
    event: req.body,
  });
  return ok(res, null, 'Webhook received');
}

export async function listOrders(req, res) {
  const result = await service.listOrders({ filters: req.validated.query, userId: req.user._id });
  return ok(res, result.data, 'Orders fetched', 200, result.meta);
}

export async function listAdminOrders(req, res) {
  const result = await service.listAdminOrders({ filters: req.validated.query });
  return ok(res, result.data, 'Orders fetched', 200, result.meta);
}

export async function getOrder(req, res) {
  const result = await service.getOrder({ resourceId: req.params.id, userId: req.user._id });
  return ok(res, result.data, 'Request successful', 200, result.meta);
}

export async function cancelOrder(req, res) {
  const result = await service.cancelOrder({ resourceId: req.params.id, userId: req.user._id });
  return ok(res, result.data, 'Order cancelled', 200, result.meta);
}

export async function updateOrderStatus(req, res) {
  const result = await service.updateOrderStatus({
    input: req.validated.body,
    resourceId: req.params.id,
  });
  return ok(res, result.data, 'Order updated', 200, result.meta);
}
