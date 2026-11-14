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

      // Lỗi hệ thống được chuyển đến handler chung của Trực.
      next(error);
    }
  };
}

export function createQueueRouter({
  queueService,
  authenticate,
  requireStaff,
}) {
  if (
    typeof queueService?.getWaiting !== 'function'
    || typeof queueService?.getCurrent !== 'function'
    || typeof queueService?.callNext !== 'function'
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

  // Cả ba API đều yêu cầu đăng nhập và vai trò nhân viên.
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

  return router;
}