import { Router } from 'express';

import { createAuthRepository } from '../modules/auth/auth.repository.js';
import { createAuthService } from '../modules/auth/auth.service.js';
import { createAuthRouter } from '../modules/auth/auth.routes.js';

import { createAuthenticate } from '../shared/middleware/authenticate.js';
import { requireStaff } from '../shared/middleware/require-staff.js';
import { requireRepresentative } from '../shared/middleware/require-representative.js';

import { createSessionRepository } from '../modules/sessions/session.repository.js';
import { createSessionService } from '../modules/sessions/session.service.js';
import { createSessionRouter } from '../modules/sessions/session.routes.js';

import { createPatientAccessRepository } from '../modules/patients/patient-access.repository.js';
import { createPatientAccessService } from '../modules/patients/patient-access.service.js';
import { createPatientRouter } from '../modules/patients/patient.routes.js';

import { createTicketRepository } from '../modules/tickets/ticket.repository.js';
import { createTicketIssueService } from '../modules/tickets/ticket-issue.service.js';
import { createTicketQueryService } from '../modules/tickets/ticket-query.service.js';
import { createTicketCancelService } from '../modules/tickets/ticket-cancel.service.js';
import { createTicketRouter } from '../modules/tickets/ticket.routes.js';

import { withTransaction } from '../shared/db/transaction.js';
import { appendTicketEvent } from '../modules/audit/append-ticket-event.js';

import { createQueueService } from '../modules/queue/queue.service.js';
import { createQueueRouter } from '../modules/queue/queue.routes.js';

export function createRoutes({ pool, noShowTimeoutSeconds }) {
  const router = Router();

  // Kiểm tra kết nối và giữ nguyên phản hồi lỗi chung của hệ thống.
  router.get('/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');

      res.json({
        data: {
          status: 'ok',
          database: 'connected',
        },
      });
    } catch {
      res.status(503).json({
        error: {
          code: 'DATABASE_UNAVAILABLE',
          message: 'Không kết nối được cơ sở dữ liệu.',
        },
      });
    }
  });

  // Dùng chung cơ chế xác thực cho các nhóm API.
  const repository = createAuthRepository(pool);

  const authenticate = createAuthenticate({
    userRepository: repository,
  });

  // Đăng ký API đăng nhập.
  router.use('/auth', createAuthRouter({
    authService: createAuthService({ repository }),
    authenticate,
  }));

  // Đăng ký API hồ sơ và quyền truy cập hồ sơ.
  router.use('/patients', createPatientRouter({
    patientAccessService: createPatientAccessService({
      repository: createPatientAccessRepository(pool),
    }),
    authenticate,
    requireRepresentative,
  }));

  // Đăng ký API quản lý phiên.
  router.use('/sessions', createSessionRouter({
    sessionService: createSessionService({
      repository: createSessionRepository(pool),
      pool,
    }),
    authenticate,
    requireStaff,
  }));

  // Dùng chung quyền truy cập hồ sơ cho các thao tác với phiếu.
  const ticketPatientAccess = createPatientAccessService({
    repository: createPatientAccessRepository(pool),
  });

  // Kết hợp đầy đủ chức năng cấp, đọc và hủy phiếu.
  router.use('/tickets', createTicketRouter({
    issueService: createTicketIssueService({
      db: pool,
      withTransaction,
      createRepository: createTicketRepository,
      patientAccess: ticketPatientAccess,
      appendTicketEvent,
    }),

    queryService: createTicketQueryService({
      db: pool,
      createRepository: createTicketRepository,
      patientAccess: ticketPatientAccess,
    }),

    cancelService: createTicketCancelService({
      db: pool,
      withTransaction,
      createRepository: createTicketRepository,
      patientAccess: ticketPatientAccess,
      appendTicketEvent,
    }),

    authenticate,
    requireRepresentative,
  }));

  // Truyền cấu hình thời gian chờ vào service hàng chờ.
  const queueService = createQueueService({
    pool,
    noShowTimeoutSeconds,
  });

  // Đăng ký API hàng chờ cùng xác thực và kiểm tra quyền nhân viên.
  router.use('/queue', createQueueRouter({
    queueService,
    authenticate,
    requireStaff,
  }));

  return router;
}
