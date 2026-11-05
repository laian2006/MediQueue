import { publicBoardApi } from './public-board.api.js';

/** Poll after completion, so slow requests never overlap. Cleanup cancels late results. */
export function pollPublicBoard({
  onData, onError, load = publicBoardApi.getBoard, intervalMs = 3000,
  schedule = setTimeout, cancel = clearTimeout,
}) {
  const controller = new AbortController();
  let timer;
  let stopped = false;
  async function poll() {
    try {
      const board = await load({ signal: controller.signal });
      if (!stopped) onData(board);
    } catch (error) {
      if (!stopped) onError(error);
    } finally {
      if (!stopped) timer = schedule(poll, intervalMs);
    }
  }
  void poll();
  return () => {
    stopped = true;
    controller.abort();
    cancel(timer);
  };
}
