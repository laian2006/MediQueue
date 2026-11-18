import { Router } from 'express';
import { SessionError } from './session.errors.js';

function handle(operation) {
  return async (req, res, next) => {
    try {
      await operation(req, res);
    } catch (error) {
      if (error instanceof SessionError) {
        return res.status(error.statusCode).json({
          error: { code: error.code, message: error.message },
        });
      }
      next(error);
    }
  };
}

function requireEmptyBody(req) {
  const hasBody = Number(req.get('content-length') ?? 0) > 0
    || req.get('transfer-encoding') !== undefined;
  if (hasBody && (!req.is('application/json') || req.body === undefined)) {
    throw new SessionError(400, 'VALIDATION_ERROR', 'Dữ liệu gửi kèm phải là JSON rỗng.');
  }
  if (req.body !== undefined && (
    req.body === null || typeof req.body !== 'object' || Array.isArray(req.body)
    || Object.keys(req.body).length !== 0
  )) {
    throw new SessionError(400, 'VALIDATION_ERROR', 'Thao tác phiên không nhận trường dữ liệu.');
  }
}

export function createSessionRouter({ sessionService, authenticate, requireStaff }) {
  // No fallback authentication: missing shared middleware must fail at startup.
  if (typeof authenticate !== 'function' || typeof requireStaff !== 'function') {
    throw new TypeError('Shared authenticate and requireStaff middleware are required.');
  }
  const router = Router();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.get('/current', authenticate, handle(async (req, res) => {
    const data = await sessionService.getCurrent(req.user);
    res.status(200).json({ data });
  }));

  router.post('/', authenticate, requireStaff, handle(async (req, res) => {
    requireEmptyBody(req);
    const data = await sessionService.open(req.user);
    res.status(201).json({ data });
  }));

  router.post('/:sessionId/stop', authenticate, requireStaff, handle(async (req, res) => {
    requireEmptyBody(req);
    const data = await sessionService.stop(req.user, req.params.sessionId);
    res.status(200).json({ data });
  }));

  router.post('/:sessionId/close', authenticate, requireStaff, handle(async (req, res) => {
    requireEmptyBody(req);
    const data = await sessionService.close(req.user, req.params.sessionId);
    res.status(200).json({ data });
  }));

  return router;
}
