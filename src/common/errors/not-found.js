import { ApiError } from './api-error.js';

export const missing = () => new ApiError(404, 'NOT_FOUND', 'Record not found');
