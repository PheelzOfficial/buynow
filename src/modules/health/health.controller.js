import { ok } from '../../common/http/response.js';
import { isDatabaseReady } from './health.service.js';

export function getHealth(req, res) {
  const ready = isDatabaseReady();
  return ok(
    res,
    { status: ready ? 'ready' : 'database disconnected' },
    'Health status',
    ready ? 200 : 503,
  );
}
