import mongoose from 'mongoose';

import { schemaOptions } from '../../common/database/schema-options.js';
const { Schema } = mongoose;
const ticket = new Schema(
  {
    userId: Schema.Types.ObjectId,
    subject: String,
    message: String,
    status: { type: String, default: 'open' },
  },
  schemaOptions,
);
export const Ticket = mongoose.model('Ticket', ticket);
