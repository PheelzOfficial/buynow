import mongoose from 'mongoose';

import { schemaOptions } from '../../common/database/schema-options.js';
const { Schema } = mongoose;
const order = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, index: true },
    idempotencyKey: String,
    items: [
      {
        _id: false,
        productId: String,
        name: String,
        image: String,
        quantity: Number,
        unitPrice: Number,
      },
    ],
    address: Schema.Types.Mixed,
    total: Number,
    currency: { type: String, default: 'NGN' },
    paymentMethod: { type: String, enum: ['cash_on_delivery'] },
    paymentStatus: { type: String, default: 'unpaid' },
    status: {
      type: String,
      enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'],
      default: 'pending',
    },
  },
  schemaOptions,
);
order.index({ userId: 1, idempotencyKey: 1 }, { unique: true });
export const Order = mongoose.model('Order', order);
