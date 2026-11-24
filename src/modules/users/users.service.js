import bcrypt from 'bcryptjs';

import { ApiError } from '../../common/errors/api-error.js';
import { clearOtp } from '../auth/otp.service.js';
import { User } from './user.model.js';
import { publicUser } from './user.serializer.js';

export async function getProfile({ user }) {
  return { data: publicUser(user), meta: null };
}

export async function updateProfile({ input, userId }) {
  const changes = input;
  const update = { ...changes };
  if (changes.preferences) {
    delete update.preferences;
    for (const [key, value] of Object.entries(changes.preferences))
      update['preferences.' + key] = value;
  }
  const updatedUser = await User.findByIdAndUpdate(
    userId,
    { $set: update },
    { new: true, runValidators: true },
  );
  return { data: publicUser(updatedUser), meta: null };
}

export async function changePassword({ input, userId }) {
  const passwords = input,
    user = await User.findById(userId).select('+password');
  if (!(await bcrypt.compare(passwords.currentPassword, user.password)))
    throw new ApiError(400, 'INCORRECT_PASSWORD', 'Current password is incorrect');
  const changed = await User.updateOne(
    { _id: user._id, password: user.password },
    {
      $set: { password: await bcrypt.hash(passwords.newPassword, 12) },
      $inc: { tokenVersion: 1 },
      $unset: clearOtp,
    },
  );
  if (!changed.modifiedCount)
    throw new ApiError(409, 'CONFLICT', 'Password changed concurrently. Sign in again');
  return { data: null, meta: null };
}
