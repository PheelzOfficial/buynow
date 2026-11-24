import crypto from 'node:crypto';

import { ApiError } from '../../common/errors/api-error.js';
import { env } from '../../config/env.js';

const BASE_URL = 'https://api.paystack.co';

export function assertPaystackConfigured() {
  if (!env.paystack.secretKey?.trim()) {
    throw new ApiError(503, 'PAYMENT_UNAVAILABLE', 'Online payment is not configured');
  }
}

async function call(path, { method = 'GET', body } = {}) {
  assertPaystackConfigured();
  let response;
  try {
    response = await fetch(BASE_URL + path, {
      method,
      headers: {
        Authorization: `Bearer ${env.paystack.secretKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body && JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
      redirect: 'error',
    });
  } catch {
    throw new ApiError(502, 'PAYMENT_PROVIDER_ERROR', 'Could not reach the payment provider');
  }
  const payload = await response.json().catch(() => null);
  // Provider messages can include account details; never forward them to clients.
  if (!response.ok || payload?.status !== true) return { ok: false, status: response.status };
  return { ok: true, data: payload.data };
}

/** Starts a Paystack transaction. `amountKobo` must be an integer. */
export async function initializeTransaction({ email, amountKobo, reference, metadata }) {
  const result = await call('/transaction/initialize', {
    method: 'POST',
    body: {
      email,
      amount: amountKobo,
      currency: 'NGN',
      reference,
      metadata,
      ...(env.paystack.callbackUrl ? { callback_url: env.paystack.callbackUrl } : {}),
    },
  });
  if (!result.ok)
    throw new ApiError(502, 'PAYMENT_PROVIDER_ERROR', 'Could not start the payment. Try again.');
  return {
    authorizationUrl: result.data.authorization_url,
    accessCode: result.data.access_code,
    reference: result.data.reference,
  };
}

/**
 * Asks Paystack for the authoritative state of a transaction.
 * Returns null when Paystack does not know the reference (e.g. checkout never opened).
 */
export async function verifyTransaction(reference) {
  const result = await call(`/transaction/verify/${encodeURIComponent(reference)}`);
  if (!result.ok) {
    if (result.status === 400 || result.status === 404) return null;
    throw new ApiError(502, 'PAYMENT_PROVIDER_ERROR', 'Could not confirm the payment. Try again.');
  }
  const { status, amount, currency, reference: ref, paid_at: paidAt, channel } = result.data;
  return { status, amountKobo: amount, currency, reference: ref, paidAt, channel };
}

/** Paystack signs webhooks with HMAC-SHA512 of the raw body using the secret key. */
export function isValidWebhookSignature(rawBody, signature) {
  const secret = env.paystack.secretKey;
  if (!secret || !rawBody || typeof signature !== 'string') return false;
  const expected = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
  const given = Buffer.from(signature, 'utf8');
  const wanted = Buffer.from(expected, 'utf8');
  return given.length === wanted.length && crypto.timingSafeEqual(given, wanted);
}
