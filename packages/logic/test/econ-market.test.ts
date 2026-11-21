import { marketGrade } from '../src/econ/market';
import { describe, expect, test } from 'vitest';
import {
  applyCommand, canonicalJson, createGame, createMatch, loadGameData, marketDay, marketView, roundStartTick, step, stepMatch,
  type GameData, type GameState,
} from '../src/index';
import { forceRound, jumpToTick, makeData, placeUnitForTest, spawnEnemyForTest } from '../src/testing';

const d3 = loadGameData('stage3');
const gradeOf = (d: GameData, id: string) => d.units.find(u => u.id === id)!.grade;
const units = (s: GameState) => s.slots.filter(Boolean).map(u => u!);

function lane(round: number, coins = 1000, seed = 1, data: GameData = d3): GameState {
  const s = createGame(data, seed);
  if (round > 0) forceRound(s, round);
  s.coins = coins;
  return s;
}

function fillOpen(s: GameState, except: number[] = []): void {
  for (let i = 0; i < s.slots.length; i++) if (s.open[i] && !s.slots[i] && !except.includes(i)) placeUnitForTest(s, 'jipsin', i);
}

const draw = { type: 'buy', item: 'draw' } as const;

test('grade boundary belongs to grade two', () => {
  expect(marketGrade([2, 1], 2 / 3 - Number.EPSILON)).toBe(3);
  expect(marketGrade([2, 1], 2 / 3)).toBe(2);
});

test('draw quota resets at round 11', () => {
  const s = lane(1, 0);
  s.buckwheat = 4;
  const r = step(s, [draw, draw, draw, draw]);
  expect(r.rejected.map(x => x.reason)).toEqual(['soldOut']);
  expect([s.buckwheat, s.coins, marketView(s)!.draw.left]).toEqual([1, 0, 0]);
  expect(units(s)).toHaveLength(3);
  for (const u of units(s)) expect(u.cost).toBe(2 ** (gradeOf(d3, u.defId) - 1));
  forceRound(s, 11);
  expect(marketView(s)).toMatchObject({ day: 2, endRound: 20, draw: { left: 3 } });
});

test('new stage 3 seats can draw at round 1', () => {
  for (const s of [createGame(d3, 1), ...Object.values(createMatch(d3, 1, [1, 2]).lanes)]) {
    expect([s.buckwheat, s.coins]).toEqual([1, 0]);
    expect(step(s, [draw]).rejected[0]?.reason).toBe('marketClosed');
    forceRound(s, 1);
    expect(step(s, [draw, draw]).rejected.map(x => x.reason)).toEqual(['noBuckwheat']);
    expect(s.buckwheat).toBe(0);
  }
});

test('full board rejects draw even with empty storage', () => {
  const s = lane(1);
  fillOpen(s);
  const before = canonicalJson(s);
  expect(applyCommand(s, draw, [])).toBe('noSlot');
  expect(canonicalJson(s)).toBe(before);
});
describe('market in a match and boss drops', () => {
  test('one seat shopping leaves the other seats unchanged in a match', () => {
    const a = createMatch(d3, 5, [1, 2]);
    const b = createMatch(d3, 5, [1, 2]);
    for (const m of [a, b]) m.lanes[1]!.coins = 1000;
    const r3 = roundStartTick(d3, 3);
    const r1 = roundStartTick(d3, 1);
    while (a.tick < r3) {
      const buy = a.tick === r1 + 5 || a.tick === r1 + 6;
      stepMatch(a, buy ? [{ seat: 1, seq: 0, cmd: { type: 'buy', item: 'draw' } }] : []);
      stepMatch(b, []);
    }
    expect(a.lanes[1]!.buckwheat).not.toBe(b.lanes[1]!.buckwheat);
    expect(canonicalJson(a.lanes[2])).toBe(canonicalJson(b.lanes[2]));
  });

  test('round 20 boss kill drops one grade-3 unit; round 10 drops nothing; full board queues it', () => {
    const s = lane(20, 0);
    const boss = spawnEnemyForTest(s, 'gangcheori', 1);
    boss.hp = 0;
    const r = step(s, []);
    const drops = r.events.filter(e => e.type === 'summon');
    expect(drops.length).toBe(1);
    expect(gradeOf(d3, units(s)[0]!.defId)).toBe(3);
    expect(units(s)[0]!.cost).toBe(4);

    const ten = lane(10, 0);
    spawnEnemyForTest(ten, 'jinegaksi', 1).hp = 0;
    expect(step(ten, []).events.filter(e => e.type === 'summon').length).toBe(0);

    const full = lane(20, 55);
    fillOpen(full);
    spawnEnemyForTest(full, 'gangcheori', 1).hp = 0;
    step(full, []);
    expect(full.econ!.pendingDrops.length).toBe(1);
    const coins = full.coins;
    expect(step(full, [{ type: 'buy', item: 'draw' }]).rejected[0]!.reason).toBe('noSlot');
    expect(full.coins).toBe(coins);
    step(full, [{ type: 'sell', slot: 0 }]);
    expect(full.econ!.pendingDrops.length).toBe(0);
    expect(gradeOf(d3, full.slots[0]!.defId)).toBe(3);
  });

  test('a round 20 boss killed after the shared clock enters 21 drops its material and records time in round 20', () => {
    const m = createMatch(d3, 1, [1, 2]);
    jumpToTick(m, roundStartTick(d3, 20));
    stepMatch(m, []);
    const lane = m.lanes[1]!;
    const boss = lane.enemies.find(e => e.boss)!;
    m.tick = roundStartTick(d3, 21) - 1;
    m.seats[1]!.bosses[20]!.ticksLeft = 1;
    stepMatch(m, [{ seat: 1, seq: 0, cmd: { type: 'disconnect' } }]);
    boss.hp = 0;
    const r = stepMatch(m, []);
    expect(m.round).toBe(21);
    expect(r.events).toContainEqual({ type: 'bossKilled', seat: 1, round: 20 });
    expect(lane.stats.find(s => s.round === 20)?.bossKillSeconds).toBe(d3.balance.bossRoundSeconds);
    expect(lane.stats.find(s => s.round === 21)?.bossKillSeconds).toBeNull();
    expect(units(lane).map(u => gradeOf(d3, u.defId))).toEqual([3]);
  });

  test('round 50 drops a grade-2 unit', () => {
    const s = lane(50, 0);
    spawnEnemyForTest(s, 'jinegaksi5', 1).hp = 0;
    step(s, []);
    expect(units(s).map(u => gradeOf(d3, u.defId))).toEqual([2]);
  });

});
