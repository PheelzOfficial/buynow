import mongoose from 'mongoose';

import { schemaOptions } from '../../common/database/schema-options.js';
const { Schema } = mongoose;
const category = new Schema(
  {
    _id: String,
    name: { type: String, required: true },
    image: { type: String, required: true },
    imagePublicId: String,
  },
  schemaOptions,
);
export const Category = mongoose.model('Category', category);
