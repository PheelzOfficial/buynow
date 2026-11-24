import { ok } from '../../common/http/response.js';
import * as service from './orders.service.js';

export async function placeOrder(req, res) {
  const result = await service.placeOrder({ input: req.validated.body, userId: req.user._id });
  return ok(res, result.data, 'Order placed', 201, result.meta);
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
