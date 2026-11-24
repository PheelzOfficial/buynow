export const ok = (res, data = null, message = 'Request successful', status = 200, meta = null) =>
  res
    .status(status)
    .json({ success: true, message, data, error: null, meta, requestId: res.locals.requestId });
