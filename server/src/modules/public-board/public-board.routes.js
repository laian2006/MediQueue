import { Router } from 'express';

export function createPublicBoardRouter({ boardService }) {
  const router = Router();
  // Public by contract. No authenticate middleware or private ticket endpoint.
  router.get('/board', async (_req, res, next) => {
    try {
      res.set('Cache-Control', 'no-store');
      res.json({ data: await boardService.getBoard() });
    } catch (error) {
      next(error);
    }
  });
  return router;
}
