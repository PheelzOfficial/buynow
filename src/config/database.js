import mongoose from 'mongoose';

import * as models from '../database/models.js';
import { env } from './env.js';

export async function connectDatabase() {
  mongoose.set('bufferCommands', false);
  await mongoose.connect(env.mongodbUri, { serverSelectionTimeoutMS: 10000 });
  await Promise.all(Object.values(models).map((model) => model.init()));
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}
