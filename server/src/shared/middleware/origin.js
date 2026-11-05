import { sendError } from './send-error.js';

export function createOriginMiddleware(clientOrigin) {
  return (req, res, next) => {
    const origin = req.get('origin');
    res.vary('Origin');
    if (origin && origin !== clientOrigin) {
      return sendError(res, 403, 'FORBIDDEN', 'Nguồn yêu cầu không được phép.');
    }
    if (origin === clientOrigin) {
      res.set('Access-Control-Allow-Origin', clientOrigin);
      res.set('Access-Control-Allow-Credentials', 'true');
    }
    if (req.method === 'OPTIONS') {
      res.set('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type');
      return res.sendStatus(204);
    }
    const writes = !['GET', 'HEAD'].includes(req.method);
    // CLI clients may omit Origin. Browser writes must carry the configured Origin;
    // reject opaque/missing origins when Fetch Metadata identifies a browser request.
    if (writes && !origin && req.get('sec-fetch-site')) {
      return sendError(res, 403, 'FORBIDDEN', 'Yêu cầu trình duyệt thiếu Origin hợp lệ.');
    }
    if (writes && (Number(req.get('content-length') ?? 0) > 0 || req.get('transfer-encoding'))
        && !req.is('application/json')) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Dữ liệu gửi kèm phải là JSON.');
    }
    next();
  };
}
