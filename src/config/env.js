import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

// Resolve configuration from the backend directory, regardless of the shell's cwd.
dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });

export const env = {
  get port() {
    return Number(process.env.PORT || 4500);
  },
  get mongodbUri() {
    return process.env.MONGODB_URI;
  },
  get jwtSecret() {
    return process.env.JWT_SECRET;
  },
  get trustProxy() {
    return process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) : undefined;
  },
  get corsOrigins() {
    return (process.env.CORS_ORIGINS || '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  },
  get cloudinary() {
    return {
      cloud_name: process.env.CLOUDINARY_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    };
  },
  // Swagger UI and /openapi.json. Off in production unless API_DOCS=true.
  get apiDocsEnabled() {
    if (process.env.API_DOCS) return process.env.API_DOCS === 'true';
    return process.env.NODE_ENV !== 'production';
  },
  get paystack() {
    return {
      secretKey: process.env.PAYSTACK_SECRET_KEY,
      // Where Paystack redirects the browser after payment; the app can watch for this URL.
      callbackUrl: process.env.PAYSTACK_CALLBACK_URL,
      // Unpaid Paystack orders release their reserved stock after this many minutes.
      orderTtlMinutes: Number(process.env.PAYSTACK_ORDER_TTL_MINUTES || 30),
    };
  },
  get brevo() {
    return {
      apiKey: process.env.BREVO_API_KEY,
      senderEmail: process.env.BREVO_SENDER_EMAIL,
      senderName: process.env.BREVO_SENDER_NAME || 'BuyNow',
    };
  },
};

export function validateEnvironment() {
  for (const name of ['MONGODB_URI', 'JWT_SECRET']) {
    if (!process.env[name]) throw new Error(`${name} must be configured in backend/.env`);
  }
  if (env.jwtSecret.length < 32) throw new Error('JWT_SECRET must have at least 32 characters');
  if (!Number.isInteger(env.port) || env.port < 1 || env.port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  const ttl = env.paystack.orderTtlMinutes;
  if (!Number.isInteger(ttl) || ttl < 5 || ttl > 24 * 60) {
    throw new Error('PAYSTACK_ORDER_TTL_MINUTES must be an integer between 5 and 1440');
  }
  if (env.trustProxy !== undefined && (!Number.isInteger(env.trustProxy) || env.trustProxy < 0)) {
    throw new Error('TRUST_PROXY must be a nonnegative integer');
  }
}
