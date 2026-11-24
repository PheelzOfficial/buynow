import mongoose from 'mongoose';

import { schemaOptions } from '../../common/database/schema-options.js';
const { Schema } = mongoose;
const user = new Schema(
  {
    username: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: String,
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ['customer', 'admin'], default: 'customer' },
    verified: { type: Boolean, default: false },
    avatar: String,
    tokenVersion: { type: Number, default: 0 },
    preferences: {
      language: { type: String, default: 'en' },
      notifications: { type: Boolean, default: true },
    },
    otpHash: { type: String, select: false },
    otpPurpose: { type: String, select: false },
    otpExpires: { type: Date, select: false },
    otpAttempts: { type: Number, default: 0, select: false },
    otpSentAt: { type: Date, select: false },
  },
  schemaOptions,
);
export const User = mongoose.model('User', user);
