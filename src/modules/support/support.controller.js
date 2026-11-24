import { ok } from '../../common/http/response.js';
import * as service from './support.service.js';

export async function createTicket(req, res) {
  const result = await service.createTicket({ input: req.validated.body, userId: req.user._id });
  return ok(res, result.data, 'Support request received', 201, result.meta);
}
