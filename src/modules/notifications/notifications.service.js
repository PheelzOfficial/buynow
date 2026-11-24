import { missing } from '../../common/errors/not-found.js';
import { pageMeta } from '../../common/utils/pagination.js';
import { Notification } from './notification.model.js';

export async function listNotifications({ filters, userId }) {
  const query = filters,
    criteria = { userId };
  const [items, total] = await Promise.all([
    Notification.find(criteria)
      .sort({ _id: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    Notification.countDocuments(criteria),
  ]);
  return { data: items, meta: pageMeta(query, total) };
}

export async function updateNotification({ input, resourceId, userId }) {
  const notification = await Notification.findOneAndUpdate(
    { _id: resourceId, userId },
    { $set: input },
    { new: true },
  );
  if (!notification) throw missing();
  return { data: notification, meta: null };
}
