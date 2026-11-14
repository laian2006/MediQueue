import { Router } from 'express';
import { createAuthRepository } from '../modules/auth/auth.repository.js';
import { createAuthService } from '../modules/auth/auth.service.js';
import { createAuthRouter } from '../modules/auth/auth.routes.js';
import { createAuthenticate } from '../shared/middleware/authenticate.js';
import { requireStaff } from '../shared/middleware/require-staff.js';
import { createSessionRepository } from '../modules/sessions/session.repository.js';
import { createSessionService } from '../modules/sessions/session.service.js';
import { createSessionRouter } from '../modules/sessions/session.routes.js';
import { createPatientAccessRepository } from '../modules/patients/patient-access.repository.js';
import { createPatientAccessService } from '../modules/patients/patient-access.service.js';
import { createPatientRouter } from '../modules/patients/patient.routes.js';
import { createTicketRepository } from '../modules/tickets/ticket.repository.js';
import { createTicketIssueService } from '../modules/tickets/ticket-issue.service.js';
import { createTicketQueryService } from '../modules/tickets/ticket-query.service.js';
import { createTicketRouter } from '../modules/tickets/ticket.routes.js';
import { withTransaction } from '../shared/db/transaction.js';
import { appendTicketEvent } from '../modules/audit/append-ticket-event.js';

import { createPublicBoardRepository } from '../modules/public-board/public-board.repository.js';
import { createPublicBoardService } from '../modules/public-board/public-board.service.js';
import { createPublicBoardRouter } from '../modules/public-board/public-board.routes.js';

export function createRoutes({ pool }) {
  const router = Router();
  router.use('/public', createPublicBoardRouter({
    boardService: createPublicBoardService({ repository: createPublicBoardRepository(pool) }),
  }));
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
  router.use('/patients', createPatientRouter({
    patientAccessService: createPatientAccessService({ repository: createPatientAccessRepository(pool) }),
    authenticate,
  }));
  router.use('/sessions', createSessionRouter({
    sessionService: createSessionService({ repository: createSessionRepository(pool) }),
    authenticate,
    requireStaff,
  }));
  // WBS 1.8 (Đức Anh): ticket issue/read. Access is checked per patientId via Hưng's service.
  const ticketPatientAccess = createPatientAccessService({ repository: createPatientAccessRepository(pool) });
  router.use('/tickets', createTicketRouter({
    issueService: createTicketIssueService({
      db: pool, withTransaction, createRepository: createTicketRepository,
      patientAccess: ticketPatientAccess, appendTicketEvent,
    }),
    queryService: createTicketQueryService({
      db: pool, createRepository: createTicketRepository, patientAccess: ticketPatientAccess,
    }),
    authenticate,
  }));
  return router;
}
