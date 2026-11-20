import { describe, expect, test } from 'vitest';
import { createMatch, loadGameData, matchHash, replayMatch, stepMatch } from '../src/index';

const data = loadGameData('stage2');

describe('replayMatch', () => {
  test('the last hash is taken on the end tick even when it is not a multiple of every', () => {
    const log = [{ tick: 0, inputs: [{ seat: 1, seq: 1, cmd: { type: 'forfeit' as const } }] }];
    const m = createMatch(data, 3, [1]);
    stepMatch(m, log[0]!.inputs);
    expect(m.result).not.toBeNull();
    expect(replayMatch(data, 3, [1], log)).toEqual([[m.tick, matchHash(m)]]);
  });
});
