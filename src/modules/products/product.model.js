import mongoose from 'mongoose';

import { schemaOptions } from '../../common/database/schema-options.js';
const { Schema } = mongoose;
const product = new Schema(
  {
    _id: String,
    categoryId: { type: String, ref: 'Category', required: true, index: true },
    name: { type: String, required: true },
    description: { type: String, required: true },
    images: { type: [String], required: true },
    imagePublicIds: [String],
    price: { type: Number, min: 0, required: true },
    // For sized products this is always the sum of sizes[].stock; every write keeps them in step.
    stock: { type: Number, min: 0, required: true },
    sizes: {
      type: [
        { _id: false, size: { type: String, required: true }, stock: { type: Number, min: 0 } },
      ],
      default: undefined,
    },
    colors: [String],
    ratings: { type: Number, default: 0 },
    reviews: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  schemaOptions,
);
product.virtual('instock').get(function () {
  return this.stock > 0;
});
product.virtual('fave').get(() => false);
product.index({ active: 1, createdAt: -1 });
product.index({ categoryId: 1, price: 1 });
export const Product = mongoose.model('Product', product);
