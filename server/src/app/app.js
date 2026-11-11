import express from 'express';
import { createSessionMiddleware } from '../shared/middleware/session.js';
import { createOriginMiddleware } from '../shared/middleware/origin.js';
import { errorHandler } from '../shared/middleware/error-handler.js';
import { createRoutes } from './routes.js';

export function createApp({ pool, config }) {
  const app = express();
  app.disable('x-powered-by');
  app.locals.noShowTimeoutSeconds = config.noShowTimeoutSeconds;
  app.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use('/api/v1', createOriginMiddleware(config.clientOrigin));
  app.use(express.json({ limit: '32kb' }));
  const sessionMiddleware = createSessionMiddleware({
    pool, secret: config.sessionSecret, secure: config.cookieSecure, schemaName: config.sessionSchema,
  });
  app.locals.sessionStore = sessionMiddleware.store;
  app.use(sessionMiddleware);
  app.use('/api/v1', createRoutes({
    pool,
    noShowTimeoutSeconds: config.noShowTimeoutSeconds,
  }));
  app.use((_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Không tìm thấy API.' } }));
  app.use(errorHandler);
  return app;
}
