import sharp from 'sharp';

import { ApiError } from '../../common/errors/api-error.js';
import { env } from '../../config/env.js';
import { configureCloud } from '../../integrations/cloudinary/cloudinary.client.js';

export async function validatedImage(buffer) {
  try {
    const metadata = await sharp(buffer, { limitInputPixels: 25000000 }).metadata();
    if (
      !['jpeg', 'png', 'webp'].includes(metadata.format) ||
      metadata.width < 80 ||
      metadata.height < 80
    )
      throw Error();
    return await sharp(buffer, { limitInputPixels: 25000000 })
      .rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    throw new ApiError(
      422,
      'INVALID_IMAGE',
      'Use a valid JPEG, PNG or WebP image of at least 80 × 80 pixels and at most 25 megapixels',
    );
  }
}
export async function uploadImage(buffer, publicId) {
  const cloudinary = configureCloud();
  if (!env.cloudinary.cloud_name || !env.cloudinary.api_key || !env.cloudinary.api_secret)
    throw new ApiError(503, 'STORAGE_UNAVAILABLE', 'Image storage is not configured');
  const validated = await validatedImage(buffer);
  try {
    return await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'buynow',
          ...(publicId ? { public_id: publicId, overwrite: true } : {}),
          resource_type: 'image',
        },
        (e, r) => (e ? reject(e) : resolve(r)),
      );
      stream.end(validated);
    });
  } catch {
    throw new ApiError(502, 'UPLOAD_FAILED', 'Image upload failed. Please try again');
  }
}
