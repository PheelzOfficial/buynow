import mongoose from 'mongoose';

import { schemaOptions } from '../../common/database/schema-options.js';
const { Schema } = mongoose;
const cart = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, unique: true },
    items: [{ _id: false, productId: String, quantity: Number }],
  },
  schemaOptions,
);
export const Cart = mongoose.model('Cart', cart);
