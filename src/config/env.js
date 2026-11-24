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
  if (env.trustProxy !== undefined && (!Number.isInteger(env.trustProxy) || env.trustProxy < 0)) {
    throw new Error('TRUST_PROXY must be a nonnegative integer');
  }
}
