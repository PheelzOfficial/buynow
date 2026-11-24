import mongoose from 'mongoose';

import { schemaOptions } from '../../common/database/schema-options.js';
const { Schema } = mongoose;
const notification = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, index: true },
    title: String,
    message: String,
    read: { type: Boolean, default: false },
  },
  schemaOptions,
);
export const Notification = mongoose.model('Notification', notification);
