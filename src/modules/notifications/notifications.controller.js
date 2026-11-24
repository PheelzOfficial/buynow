import { ok } from '../../common/http/response.js';
import * as service from './notifications.service.js';

export async function listNotifications(req, res) {
  const result = await service.listNotifications({
    filters: req.validated.query,
    userId: req.user._id,
  });
  return ok(res, result.data, 'Notifications fetched', 200, result.meta);
}

export async function updateNotification(req, res) {
  const result = await service.updateNotification({
    input: req.validated.body,
    resourceId: req.params.id,
    userId: req.user._id,
  });
  return ok(res, result.data, 'Notification updated', 200, result.meta);
}
