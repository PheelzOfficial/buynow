import { v2 as cloudinary } from 'cloudinary';

import { env } from '../../config/env.js';

export function configureCloud() {
  cloudinary.config(env.cloudinary);
  return cloudinary;
}
