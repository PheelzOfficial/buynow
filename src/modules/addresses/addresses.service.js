import { missing } from '../../common/errors/not-found.js';
import { Address } from './address.model.js';

export async function listAddresses({ userId }) {
  return { data: await Address.find({ userId }), meta: null };
}

export async function createAddress({ input, userId }) {
  return { data: await Address.create({ ...input, userId }), meta: null };
}

export async function updateAddress({ input, resourceId, userId }) {
  const address = await Address.findOneAndUpdate(
    { _id: resourceId, userId },
    { $set: input },
    { new: true },
  );
  if (!address) throw missing();
  return { data: address, meta: null };
}

export async function deleteAddress({ resourceId, userId }) {
  if (!(await Address.findOneAndDelete({ _id: resourceId, userId }))) throw missing();
  return { data: null, meta: null };
}
