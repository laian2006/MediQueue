import { Router } from 'express';

import { QueueError } from './queue.errors.js';

function handle(operation) {
  return async (req, res, next) => {
    try {
      const data = await operation(req);
      res.status(200).json({ data });
    } catch (error) {
      if (error instanceof QueueError) {
        return res.status(error.statusCode).json({
          error: {
            code: error.code,
            message: error.message,
          },
        });
      }

      // Lỗi hệ thống được chuyển đến handler chung.
      next(error);
    }
  };
}

function requireEmptyRequest(req) {
  // Các thao tác nhận ticketId từ đường dẫn, không nhận body hay query.
  if (
    Object.keys(req.query).length > 0
    || req.body !== undefined
    || Number(req.get('content-length') ?? 0) > 0
    || req.get('transfer-encoding')
  ) {
    throw new QueueError(
      400,
      'VALIDATION_ERROR',
      'This endpoint does not accept a request body or query parameters.',
    );
  }
}

export function createQueueRouter({
  queueService,
  authenticate,
  requireStaff,
}) {
  const methods = [
    'getWaiting',
    'getCurrent',
    'callNext',
    'recall',
    'start',
    'complete',
  ];

  if (
    methods.some((name) => typeof queueService?.[name] !== 'function')
    || typeof authenticate !== 'function'
    || typeof requireStaff !== 'function'
  ) {
    throw new TypeError(
      'Queue service and shared middleware are required.',
    );
  }

  const router = Router();

  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  // Mọi API quầy đều yêu cầu đăng nhập và quyền nhân viên.
  router.use(authenticate, requireStaff);

  router.get('/waiting', handle((req) =>
    queueService.getWaiting(req.user, req.query),
  ));

  router.get('/current', handle((req) =>
    queueService.getCurrent(req.user, req.query),
  ));

  router.post('/call-next', handle((req) => {
    if (!req.is('application/json')) {
      throw new QueueError(
        400,
        'VALIDATION_ERROR',
        'The request body must use application/json.',
      );
    }

    return queueService.callNext(req.user, req.body);
  }));

  router.post('/tickets/:ticketId/recall', handle((req) => {
    requireEmptyRequest(req);
    return queueService.recall(req.user, req.params.ticketId);
  }));

  router.post('/tickets/:ticketId/start', handle((req) => {
    requireEmptyRequest(req);
    return queueService.start(req.user, req.params.ticketId);
  }));

  router.post('/tickets/:ticketId/complete', handle((req) => {
    requireEmptyRequest(req);
    return queueService.complete(req.user, req.params.ticketId);
  }));

  return router;
}