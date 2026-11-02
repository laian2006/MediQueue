// Phản hồi lỗi theo hợp đồng: { error: { code, message } }, không lộ chi tiết nội bộ.
export function sendError(res, statusCode, code, message) {
  return res.status(statusCode).json({ error: { code, message } });
}
