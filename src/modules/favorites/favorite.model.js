import mongoose from 'mongoose';

import { schemaOptions } from '../../common/database/schema-options.js';
const { Schema } = mongoose;
const favorite = new Schema({ userId: Schema.Types.ObjectId, productId: String }, schemaOptions);
favorite.index({ userId: 1, productId: 1 }, { unique: true });
export const Favorite = mongoose.model('Favorite', favorite);
