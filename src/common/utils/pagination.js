export const pageMeta = (p, total) => ({
  ...p,
  total,
  pages: Math.ceil(total / p.limit),
  hasNext: p.page * p.limit < total,
});
