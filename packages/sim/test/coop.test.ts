import { describe, expect, test } from 'vitest';
import { createMatch, loadGameData, matchHash, replayMatch, stepMatch } from '@dorandi/logic';
import { jumpToTick, placeUnitForTest } from '@dorandi/logic/testing';
import { followBoss } from '../src/bots';
import { coopRows, runMatch, spiritSupport, teamRow } from '../src/coop';

const data = loadGameData('stage2');

describe('coop sim', () => {
  test('deterministic and replayable from its input log', () => {
    const a = runMatch(data, 4, ['normal', 'clumsy']);
    expect(a.match.result).not.toBeNull();
    expect(matchHash(runMatch(data, 4, ['normal', 'clumsy']).match)).toBe(matchHash(a.match));
    expect(replayMatch(data, 4, [1, 2], a.log)).toEqual(a.hashes);
  }, 120_000);
  test('normal bot follows the yeoksin like a boss', () => {
    const m = createMatch(data, 1, [1]); jumpToTick(m, 4600); stepMatch(m, []);
    const lane = m.lanes[1]!;
    placeUnitForTest(lane, 'sotlid', 17);
    expect(followBoss(lane).length).toBeGreaterThan(0);
  });
  test('spirit supports the survivor with the most enemies, smaller seat on ties', () => {
    const m = createMatch(data, 1, [1, 2, 3]); jumpToTick(m, 1000);
    stepMatch(m, [{ seat: 1, seq: 1, cmd: { type: 'forfeit' } }]);
    m.seats[1]!.supportTokens = 1;
    expect(spiritSupport(m, 1)).toEqual({ type: 'support', target: 2 });
    m.seats[2]!.receivedThisRound = true;
    expect(spiritSupport(m, 1)).toEqual({ type: 'support', target: 3 });
  });
  test('csv shapes', () => {
    const run = runMatch(data, 2, ['clumsy']);
    expect(coopRows(run, 2, 'clumsy1')[0]!.slice(0, 5)).toEqual(['2', 'clumsy1', '1', expect.stringMatching(/^(true|false)$/), '1']);
    expect(Object.keys(teamRow(run, 2, 'clumsy1'))).toEqual(['seed', 'config', 'players', 'started', 'alive', 'outcome', 'endTick', 'endRound', 'y1Enter', 'y1Kill', 'y1HpAtGate', 'y2Enter', 'y2Kill', 'y2HpAtGate', 'damage', 'supportSent', 'supportReceived', 'causes', 'leftoverGrade1']);
  }, 60_000);
});
