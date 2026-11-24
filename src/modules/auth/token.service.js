import jwt from 'jsonwebtoken';

import { env } from '../../config/env.js';

export const token = (user) =>
  jwt.sign({ sub: user.id, version: user.tokenVersion }, env.jwtSecret, {
    expiresIn: '1d',
    issuer: 'buynow',
    audience: 'buynow-app',
  });
