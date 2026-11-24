import { z } from 'zod';

import { pagination, objectId } from '../../common/validation/schemas.js';

export const listNotificationsQuerySchema = pagination;

export const updateNotificationParamsSchema = z.strictObject({
  id: objectId.meta({
    description: 'ID of one of your notifications (from GET /notifications).',
    example: '665f1c2e9b1d4a3f8c7e2a12',
  }),
});

export const updateNotificationBodySchema = z.strictObject({
  read: z.boolean().meta({
    description: 'true marks the notification as read; false marks it unread again.',
    example: true,
  }),
});
