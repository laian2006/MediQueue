import { Router } from 'express';
import { createAuthRepository } from '../modules/auth/auth.repository.js';
import { createAuthService } from '../modules/auth/auth.service.js';
import { createAuthRouter } from '../modules/auth/auth.routes.js';
import { createAuthenticate } from '../shared/middleware/authenticate.js';
import { requireStaff } from '../shared/middleware/require-staff.js';
import { createSessionRepository } from '../modules/sessions/session.repository.js';
import { createSessionService } from '../modules/sessions/session.service.js';
import { createSessionRouter } from '../modules/sessions/session.routes.js';
import { createQueueService } from '../modules/queue/queue.service.js';
import { createQueueRouter } from '../modules/queue/queue.routes.js';

export function createRoutes({ pool, noShowTimeoutSeconds }) {
  const router = Router();
  router.get('/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ data: { status: 'ok', database: 'connected' } });
    } catch {
      res.status(503).json({ error: { code: 'DATABASE_UNAVAILABLE', message: 'Không kết nối được cơ sở dữ liệu.' } });
    }
  });
  const repository = createAuthRepository(pool);
  const authenticate = createAuthenticate({ userRepository: repository });
  router.use('/auth', createAuthRouter({ authService: createAuthService({ repository }), authenticate }));
  router.use('/sessions', createSessionRouter({
    sessionService: createSessionService({ repository: createSessionRepository(pool) }),
    authenticate,
    requireStaff,
  }));
    // Tái sử dụng pool, cấu hình và quyền từ hạ tầng chung.
  const queueService = createQueueService({
    pool,
    noShowTimeoutSeconds,
  });

  router.use('/queue', createQueueRouter({
    queueService,
    authenticate,
    requireStaff,
  }));
  return router;
}
