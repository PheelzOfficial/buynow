import { ok } from '../../common/http/response.js';
import * as service from './favorites.service.js';

export async function listFavorites(req, res) {
  const result = await service.listFavorites({
    filters: req.validated.query,
    userId: req.user._id,
  });
  return ok(res, result.data, 'Favorites fetched', 200, result.meta);
}

export async function addFavorite(req, res) {
  const result = await service.addFavorite({ resourceId: req.params.id, userId: req.user._id });
  return ok(res, result.data, 'Favorite saved', 200, result.meta);
}

export async function removeFavorite(req, res) {
  const result = await service.removeFavorite({ resourceId: req.params.id, userId: req.user._id });
  return ok(res, result.data, 'Favorite removed', 200, result.meta);
}
