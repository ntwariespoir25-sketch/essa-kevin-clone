const paginate = (query) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.max(0, parseInt(query.limit, 10) || 0);
  const skip = limit > 0 ? (page - 1) * limit : 0;
  return { page, limit, skip };
};

const respondList = (res, rows, { page, limit, total }) => {
  if (limit > 0) {
    return res.json({ success: true, data: rows, total, page, limit, totalPages: Math.ceil(total / limit) });
  }
  return res.json(rows);
};

module.exports = { paginate, respondList };