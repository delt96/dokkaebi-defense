import { describe, expect, test } from 'vitest';
import { createGame, loadGameData, step, type Command } from '../src/index';

describe('registry via index only', () => {
  test('every command type has a handler when only index is imported', () => {
    const s = createGame(loadGameData(), 1);
    const commands: Command[] = [
      { type: 'summon' }, { type: 'combine', result: 'gamasot' }, { type: 'sell', slot: 23 },
      { type: 'move', from: 23, to: 1 }, { type: 'upgrade', id: 'physical' }, { type: 'convertToken' }, { type: 'helperOpened' },
    ];
    const r = step(s, commands);
    expect(r.rejected.map(x => x.reason)).toEqual(['missingMaterials', 'noUnit', 'noUnit', 'noCoins']);
  });
  test('unknown command type is rejected without throwing', () => {
    const s = createGame(loadGameData(), 1);
    const r = step(s, [{ type: '__proto__' } as unknown as Command, { type: 'toString' } as unknown as Command]);
    expect(r.rejected.map(x => x.reason)).toEqual(['unknown', 'unknown']);
  });
});
