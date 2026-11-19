import { toPublicBoardDto } from './public-board.dto.js';

export function createPublicBoardService({ repository }) {
  return { getBoard: async () => toPublicBoardDto(await repository.getSnapshot()) };
}
