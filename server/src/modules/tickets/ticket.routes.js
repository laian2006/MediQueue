import { Router } from 'express';
import { TicketError } from './ticket.errors.js';

function handle(operation) {
  return async (req, res, next) => {
    try {
      await operation(req, res);
    } catch (error) {
      if (error instanceof TicketError) {
        const body = { code: error.code, message: error.message };
        if (error.details !== undefined) body.details = error.details;
        return res.status(error.statusCode).json({ error: body });
      }
      // Unexpected errors go to the shared handler, which must not leak DB details.
      next(error);
    }
  };
}

/**
 * Mount at /api/v1/tickets (WBS 1.8).
 * - authenticate: Hưng's shared middleware; sets req.user = { userId, role, displayName }.
 * - issueService: createTicketIssueService(...) (WBS 1.7).
 * - queryService: createTicketQueryService(...).
 * - cancelService: createTicketCancelService(...) (WBS 2.13).
 * express.json() must run before this router (shared app, WBS 1.19).
 */
export function createTicketRouter({ issueService, queryService, cancelService, authenticate }) {
  // No fallback authentication: missing shared middleware must fail at startup.
  if (typeof authenticate !== 'function') {
    throw new TypeError('Shared authenticate middleware is required.');
  }
  if (typeof issueService?.issueWithStatus !== 'function') throw new TypeError('issueService is required.');
  if (typeof queryService?.getById !== 'function' || typeof queryService?.getActive !== 'function') {
    throw new TypeError('queryService is required.');
  }
  if (typeof cancelService?.cancel !== 'function') throw new TypeError('cancelService is required.');
  const router = Router();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.post('/', authenticate, handle(async (req, res) => {
    if (!req.is('application/json') || req.body === undefined) {
      throw new TicketError(400, 'VALIDATION_ERROR', 'Dữ liệu gửi kèm phải là JSON.');
    }
    const { ticket, replayed } = await issueService.issueWithStatus(req.user, req.body);
    // Re-read through the query service: same access rules and a fresh waitingAhead.
    const data = await queryService.getById(req.user, ticket.ticketId);
    // v1.0: first issue 201; a valid retry with the same requestId 200 with the stored ticket (2.7).
    res.status(replayed ? 200 : 201).json({ data });
  }));

  // Registered before '/:ticketId' so "active" is never parsed as an id.
  router.get('/active', authenticate, handle(async (req, res) => {
    const data = await queryService.getActive(req.user, { ...req.query });
    res.status(200).json({ data });
  }));

  router.get('/:ticketId', authenticate, handle(async (req, res) => {
    const data = await queryService.getById(req.user, req.params.ticketId);
    res.status(200).json({ data });
  }));

  router.post('/:ticketId/cancel', authenticate, handle(async (req, res) => {
    if (req.body !== undefined) {
      throw new TicketError(400, 'VALIDATION_ERROR', 'Hủy phiếu không nhận dữ liệu gửi kèm.');
    }
    const data = await cancelService.cancel(req.user, req.params.ticketId);
    res.json({ data });
  }));

  return router;
}
