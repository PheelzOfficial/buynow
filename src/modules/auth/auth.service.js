import bcrypt from 'bcryptjs';

import { ApiError } from '../../common/errors/api-error.js';
import { assertEmailConfigured } from '../../integrations/email/email.service.js';
import { User } from '../users/user.model.js';
import { publicUser } from '../users/user.serializer.js';
import { sendOtp, consumeOtp } from './otp.service.js';
import { token } from './token.service.js';

export async function register({ input }) {
  const payload = input;
  const user = await User.create({
    ...payload,
    password: await bcrypt.hash(payload.password, 12),
  });
  return { data: { user: publicUser(user), accessToken: token(user) }, meta: null };
}

export async function login({ input }) {
  const credentials = input,
    user = await User.findOne({ email: credentials.email }).select('+password');
  const hash = user?.password || '$2b$12$KIXx8S8h0A9RmC4XKkTZkeX8m7ccTtZpfa0S8jw2OzKEJo43cTQ8e';
  if (!(await bcrypt.compare(credentials.password, hash)) || !user)
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  return { data: { user: publicUser(user), accessToken: token(user) }, meta: null };
}

async function requestOtp(email, purpose) {
  assertEmailConfigured();
  const user = await User.findOne({ email });
  if (user && (purpose === 'reset' || !user.verified)) {
    try {
      await sendOtp(user, purpose);
    } catch (error) {
      if (error.code !== 'OTP_COOLDOWN') throw error;
    }
  }
  return { data: null, meta: null };
}

export async function forgotPassword({ input }) {
  return requestOtp(input.email, 'reset');
}

export async function resendVerification({ input }) {
  return requestOtp(input.email, 'verify');
}

export async function verifyEmail({ input }) {
  await consumeOtp(input, 'verify', { verified: true });
  return { data: null, meta: null };
}

export async function resetPassword({ input }) {
  await consumeOtp(input, 'reset', {
    password: await bcrypt.hash(input.newPassword, 12),
  });
  return { data: null, meta: null };
}

export async function logout({ userId }) {
  await User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } });
  return { data: null, meta: null };
}
