import crypto from 'node:crypto';

import { ApiError } from '../../common/errors/api-error.js';
import { env } from '../../config/env.js';
import { assertEmailConfigured, sendEmail } from '../../integrations/email/email.service.js';
import { User } from '../users/user.model.js';

const hashOtp = (value) => crypto.createHmac('sha256', env.jwtSecret).update(value).digest('hex');

export async function sendOtp(user, purpose) {
  assertEmailConfigured();
  const otp = crypto.randomInt(100000, 1000000).toString(),
    otpHash = hashOtp(otp);
  const claimed = await User.findOneAndUpdate(
    {
      _id: user._id,
      $or: [
        { otpSentAt: { $lt: new Date(Date.now() - 60000) } },
        { otpSentAt: { $exists: false } },
      ],
    },
    {
      $set: {
        otpHash,
        otpPurpose: purpose,
        otpExpires: new Date(Date.now() + 600000),
        otpAttempts: 0,
        otpSentAt: new Date(),
      },
    },
    { new: true },
  );
  if (!claimed)
    throw new ApiError(429, 'OTP_COOLDOWN', 'Wait one minute before requesting another code');
  try {
    await sendEmail({
      to: user.email,
      subject: 'BuyNow verification code',
      text: `Your ${purpose === 'reset' ? 'password reset' : 'email verification'} code is ${otp}. It expires in 10 minutes. If you did not request this, ignore this email.`,
    });
  } catch {
    await User.updateOne(
      { _id: user._id, otpHash },
      { $unset: { otpHash: 1, otpPurpose: 1, otpExpires: 1, otpSentAt: 1 } },
    );
    throw new ApiError(502, 'EMAIL_DELIVERY_FAILED', 'Could not send email. Please try again.');
  }
}

export const clearOtp = {
  otpHash: 1,
  otpPurpose: 1,
  otpExpires: 1,
  otpSentAt: 1,
  otpAttempts: 1,
};

export async function consumeOtp(body, purpose, changes) {
  // Count every attempt atomically before comparing; concurrent attempts cannot bypass the cap.
  const user = await User.findOneAndUpdate(
    {
      email: body.email,
      otpPurpose: purpose,
      otpExpires: { $gt: new Date() },
      otpAttempts: { $lt: 5 },
    },
    { $inc: { otpAttempts: 1 } },
    { new: true },
  ).select('+otpHash');
  if (!user || user.otpHash !== hashOtp(body.otp))
    throw new ApiError(400, 'INVALID_OTP', 'Invalid or expired OTP');
  const updated = await User.findOneAndUpdate(
    {
      _id: user._id,
      otpHash: user.otpHash,
      otpPurpose: purpose,
      otpExpires: { $gt: new Date() },
    },
    {
      $set: changes,
      $unset: clearOtp,
      ...(purpose === 'reset' ? { $inc: { tokenVersion: 1 } } : {}),
    },
    { new: true },
  );
  if (!updated) throw new ApiError(400, 'INVALID_OTP', 'Invalid or expired OTP');
  return updated;
}
