import { ApiError } from '../../common/errors/api-error.js';
import { ok } from '../../common/http/response.js';
import { uploadImage } from './media.service.js';

export async function upload(req, res) {
  if (!req.file) throw new ApiError(422, 'IMAGE_REQUIRED', 'Provide an image file');
  const result = await uploadImage(req.file.buffer);
  return ok(
    res,
    {
      url: result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height,
    },
    'Image uploaded',
    201,
  );
}
