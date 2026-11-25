import { describe, expect, test } from 'vitest';
import { createGame, loadGameData, type GameState } from '@dorandi/logic';
import { forceRound, placeUnitForTest, spawnEnemyForTest } from '@dorandi/logic/testing';
import {
  bossCsvRows, bossPlay, boardFirepower, firepowerCsvRows, firepowerMarkdown, firepowerRun, measureBoard, nextBoss, roundNeed, roundPlay, standOff,
} from '../src/stage3/firepower';
import { STANDARD_CONFIGS } from '../src/stage3/econRun';

const d3 = loadGameData('stage3');

function board(round: number, units: string[]): GameState {
  const s = createGame(d3, 1);
  forceRound(s, round);
  units.forEach((id, i) => placeUnitForTest(s, id, i));
  return s;
}

describe('round need', () => {
  test('is the HP of the 30 spawns in pattern order over the round time, NaN on a boss round', () => {
    // round 21 japgwi: round(63.75 + 13.6 * 21^1.5) = 1373
    expect(roundNeed(d3, 21)).toBeCloseTo((30 * 1373) / 34, 6);
    // round 59 japgwi, geuseundae, dueoksini in turn: 6227, 6227, round(6227.15 * 1.5) = 9341
    expect(roundNeed(d3, 59)).toBeCloseTo((10 * (6227 + 6227 + 9341)) / 34, 6);
    expect(roundNeed(d3, 21, ['dueoksini'])).toBeCloseTo((30 * 2059) / 34, 6);
    expect(roundNeed(d3, 20)).toBeNaN();
  });
});

describe('board firepower', () => {
  test('an empty board deals nothing, units add firepower, and the snapshot is left as it was', () => {
    const s = board(21, []);
    expect(boardFirepower(s, 21)).toBe(0);
    placeUnitForTest(s, 'top', 0);
    const one = boardFirepower(s, 21);
    expect(one).toBeGreaterThan(0);
    expect(boardFirepower(s, 21)).toBe(one);
    placeUnitForTest(s, 'kkeul', 1);
    expect(boardFirepower(s, 21)).toBeGreaterThan(one);
    expect([s.round, s.enemies.length, s.slots.filter(Boolean).length]).toEqual([21, 0, 2]);
  });

  test('measures the round it is asked for, whatever round the snapshot is in', () => {
    // a magical board against round 15 dueoksini (magical resist 0.5) deals half of what it deals to round 14 japgwi
    const s = board(14, ['che', 'che']);
    expect(boardFirepower(s, 15) / boardFirepower(s, 14)).toBeCloseTo(0.5, 1);
    expect(boardFirepower(s, 15)).toBe(boardFirepower(board(15, ['che', 'che']), 15));
  });

  test('stands the whole pattern of a mixed round, or the enemies it is given', () => {
    const s = board(59, ['dunggumi', 'dunggumi']);
    const japgwi = boardFirepower(s, 59, ['japgwi']);
    const geuseundae = boardFirepower(s, 59, ['geuseundae']);
    const mixed = boardFirepower(s, 59);
    expect(geuseundae).toBeLessThan(japgwi);
    expect(mixed).toBeLessThan(japgwi);
    expect(mixed).toBeGreaterThan(geuseundae);
  });
});

describe('shred', () => {
  test('is the weakening on the enemy as each hit of its damage type lands, none without hits of that type', () => {
    expect(standOff(board(41, ['dunggumi', 'dunggumi']), 41).shred).toEqual({ physical: 0, magical: null });
    // bujipge weakens physical by 0.1, sutdarimi magical by 0.12, each on a chance and for a few seconds
    const physical = standOff(board(41, ['bujipge', 'bujipge', 'dunggumi']), 41).shred;
    expect(physical.physical).toBeGreaterThan(0);
    expect(physical.physical).toBeLessThanOrEqual(0.1);
    expect(physical.magical).toBeNull();
    const magical = standOff(board(41, ['sutdarimi', 'sutdarimi', 'dunggumi']), 41).shred;
    expect(magical.magical).toBeGreaterThan(0);
    expect(magical.magical).toBeLessThanOrEqual(0.12);
    expect(magical.physical).toBe(0);
  });

  test('counts the weakening where the hits land, not over the whole lap of the boss', () => {
    // cheonnyeonmuseosot puts magical 0.17 for 4 s on every hit; che next to it hits the boss while it is on
    const r = bossPlay(board(59, ['cheonnyeonmuseosot', 'che']), 60).shred;
    expect(r.magical).toBeGreaterThan(0.1);
    expect(r.magical).toBeLessThanOrEqual(0.17);
    expect(r.physical).toBe(0);
  });
});

describe('boss play', () => {
  test('the next boss is the first boss round after the round, none after the last', () => {
    expect([nextBoss(d3, 5), nextBoss(d3, 10), nextBoss(d3, 59), nextBoss(d3, 69), nextBoss(d3, 70)]).toEqual([10, 20, 60, 70, null]);
  });

  test('an empty board leaves the whole boss when its round runs out', () => {
    const s = board(59, []);
    expect(bossPlay(s, 60)).toEqual({ boss: 60, killSeconds: null, hpLeftPct: 100, shred: { physical: null, magical: null } });
    expect([s.round, s.enemies.length]).toEqual([59, 0]);
  });

  test('a strong board kills the round 10 boss within the round and the weakening on it is kept', () => {
    const r = bossPlay(board(9, ['bujipge', 'bujipge', 'bujipge', 'dunggumi', 'dunggumi', 'dunggumi', 'dunggumi', 'dunggumi']), 10);
    expect(r.killSeconds).toBeGreaterThan(0);
    expect(r.killSeconds).toBeLessThan(75);
    expect(r.hpLeftPct).toBe(0);
    expect(r.shred.physical).toBeGreaterThan(0);
    expect(r.shred.magical).toBeNull();
  });
});

describe('measure board', () => {
  test('names the normal enemy the board is weakest against and gives the ratio against each kind', () => {
    const physical = measureBoard(board(41, ['dunggumi', 'dunggumi']), 41);
    expect(physical.weakestEnemy).toBe('geuseundae');
    expect(physical.weakest).toBeLessThan(physical.ratio);
    expect(Object.keys(physical.alone).sort()).toEqual(['dueoksini', 'geuseundae', 'japgwi']);
    // round 41 is a japgwi round
    expect(physical.alone.japgwi).toBe(physical.ratio);
    expect(physical.alone.geuseundae).toBe(physical.weakest);
    expect(measureBoard(board(41, ['che', 'che']), 41).weakestEnemy).toBe('dueoksini');
  });

  test('plays the next boss with the board', () => {
    expect(measureBoard(board(55, []), 55).boss).toEqual({ boss: 60, killSeconds: null, hpLeftPct: 100, shred: { physical: null, magical: null } });
  });
});

describe('round play', () => {
  test('an empty board leaves every spawn of the round alive', () => {
    const s = board(21, []);
    expect(roundPlay(s, 21)).toEqual({ left: 30, peak: 30, hpLeftPct: 100 });
    expect([s.round, s.enemies.length]).toEqual([21, 0]);
  });

  test('a strong board clears round 1', () => {
    const r = roundPlay(board(1, ['dunggumi', 'dunggumi', 'dunggumi', 'dunggumi']), 1);
    expect([r.left, r.hpLeftPct]).toEqual([0, 0]);
    expect(r.peak).toBeGreaterThan(0);
  });

  test('leaves out enemies carried over from the round before', () => {
    const s = board(20, []);
    spawnEnemyForTest(s, 'japgwi', 3);
    expect(roundPlay(s, 21).left).toBe(30);
  });
});

describe('firepower run', () => {
  test('measures every live seat at the asked rounds and the markdown reports ratios, leftovers and the ratio bands', () => {
    const c = STANDARD_CONFIGS.find(x => x.name === 'switch-full-q2')!;
    const { rows, bosses } = firepowerRun(d3, 1, c, [5, 11], []);
    expect(bosses).toEqual([]);
    expect(rows.map(r => r.round)).toEqual([...Array(6).fill(5), ...Array(6).fill(11)]);
    for (const r of rows) {
      expect(r.ratio).toBeCloseTo(r.firepower / r.need);
      expect(r.weakest).toBeLessThanOrEqual(r.ratio + 1e-9);
      expect(r.left).toBeGreaterThanOrEqual(0);
    }
    const md = firepowerMarkdown(rows);
    expect(md).toContain('switch-full-q2');
    expect(md).toContain('| 라운드 | 적 | 요구 화력 | 배수 | 잡귀 | 약한 적 | 물깎 / 마깎 (무리 · 보스) | 남은 적 | 다음 보스 |');
    expect(md).toContain('| 배수 구간 |');
    const csv = firepowerCsvRows(rows);
    expect(Object.keys(csv[0]!)).toEqual(expect.arrayContaining([
      'vs_japgwi', 'vs_geuseundae', 'vs_dueoksini', 'shredPhysical', 'shredMagical',
      'boss', 'bossKillSeconds', 'bossHpLeftPct', 'bossShredPhysical', 'bossShredMagical',
    ]));
    expect(csv.every(r => Object.values(r).every(v => typeof v !== 'object' || v === null))).toBe(true);
  }, 120_000);
});

describe('boss at its round', () => {
  test('plays each asked boss with the board its round starts with, next to what the run itself did', () => {
    const c = STANDARD_CONFIGS.find(x => x.name === 'switch-full-q2')!;
    const { rows, bosses } = firepowerRun(d3, 1, c, [], [10]);
    expect(rows).toEqual([]);
    expect(bosses.map(b => [b.boss, b.seat])).toEqual([1, 2, 3, 4, 5, 6].map(seat => [10, seat]));
    for (const b of bosses) {
      expect(b.killSeconds === null ? b.hpLeftPct > 0 : b.killSeconds > 0 && b.killSeconds <= 75).toBe(true);
      expect(b.actualKillSeconds === null || (b.actualKillSeconds > 0 && b.actualKillSeconds <= 75)).toBe(true);
    }
    // the run went on through the boss round, so whether each seat killed it is known
    expect(bosses.some(b => b.actualKillSeconds !== null)).toBe(true);
    const md = firepowerMarkdown([], d3, bosses);
    expect(md).toContain('| 보스 | 체력 | 잡은 판 | 처치 시간 | 못 잡은 판 남은 체력 | 물깎 / 마깎 | 실제로 잡은 판 |');
    expect(md).toContain('| 10 | 5000 |');
    const csv = bossCsvRows(bosses);
    expect(Object.keys(csv[0]!)).toEqual(expect.arrayContaining(['boss', 'killSeconds', 'shredPhysical', 'shredMagical', 'actualKillSeconds']));
  }, 120_000);
});
