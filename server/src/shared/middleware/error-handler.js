export function errorHandler(error, _req, res, next) {
  if (res.headersSent) return next(error);
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'JSON không hợp lệ.' } });
  }
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'VALIDATION_ERROR', message: 'Dữ liệu gửi kèm quá lớn.' } });
  }
  console.error('API request failed.');
  return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Hệ thống gặp lỗi. Vui lòng thử lại.' } });
}
