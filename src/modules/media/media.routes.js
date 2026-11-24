import { Router } from 'express';

import { authenticate } from '../../common/middleware/authenticate.js';
import { imageUpload } from '../../common/middleware/upload.js';
import { validate } from '../../common/middleware/validate.js';
import { empty } from '../../common/validation/schemas.js';
import { upload } from './media.controller.js';

const router = Router();
router.post('/uploads/image', authenticate, imageUpload, validate(empty), upload);
export default router;
