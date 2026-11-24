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
    paymentMethod: { type: String, enum: ['cash_on_delivery', 'paystack'] },
    // refund_due: money arrived after the order was cancelled/expired; an admin must refund it.
    paymentStatus: { type: String, enum: ['unpaid', 'paid', 'refund_due'], default: 'unpaid' },
    payment: new Schema(
      {
        reference: String,
        authorizationUrl: String,
        accessCode: String,
        expiresAt: Date,
        paidAt: Date,
        channel: String,
      },
      { _id: false },
    ),
    status: {
      type: String,
      enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'],
      default: 'pending',
    },
  },
  schemaOptions,
);
order.index({ userId: 1, idempotencyKey: 1 }, { unique: true });
order.index({ 'payment.reference': 1 }, { unique: true, sparse: true });
order.index({ paymentMethod: 1, paymentStatus: 1, status: 1, 'payment.expiresAt': 1 });
export const Order = mongoose.model('Order', order);
