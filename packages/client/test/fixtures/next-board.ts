import { createGame, loadGameData, type GameState } from '@dorandi/logic';
import { placeUnitForTest } from '@dorandi/logic/testing';

/** The mockup's example board, slots 0-15 in order. */
export const MOCK_BOARD: readonly string[] = [
  'jipsin', 'bitjaru', 'horong', 'jangdok', 'jipsin', 'buchae', 'jeolgu', 'dadeumi',
  'mumyeong', 'hwaro', 'ki', 'gamasot', 'moru', 'top', 'gimseobang', 'hanji',
];

export const MOCK_TARGET = 'yeonjabangga';

export function mockBoardState(): GameState {
  const s = createGame(loadGameData('stage3'), 1);
  MOCK_BOARD.forEach((id, slot) => placeUnitForTest(s, id, slot));
  return s;
}
