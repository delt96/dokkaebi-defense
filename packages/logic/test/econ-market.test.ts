import { describe, expect, test } from 'vitest';
import {
  canonicalJson, createGame, createMatch, loadGameData, marketView, roundStartTick, step, stepMatch,
  type GameData, type GameState,
} from '../src/index';
import { forceRound, jumpToTick, makeData, placeUnitForTest, spawnEnemyForTest, withoutMarketLock } from '../src/testing';

const locked = loadGameData('stage3');
const d3 = withoutMarketLock(locked);
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

const draw = { type: 'gambleUnit', table: 'small' } as const;

describe('market in a match and boss drops', () => {
  test('one seat shopping leaves the other seats unchanged in a match', () => {
    const a = createMatch(d3, 5, [1, 2]);
    const b = createMatch(d3, 5, [1, 2]);
    for (const m of [a, b]) m.lanes[1]!.coins = 1000;
    const r3 = roundStartTick(d3, 3);
    const r1 = roundStartTick(d3, 1);
    while (a.tick < r3) {
      const buy = a.tick === r1 + 5 || a.tick === r1 + 6;
      stepMatch(a, buy ? [{ seat: 1, seq: 0, cmd: { type: 'gambleUnit', table: 'small' } }] : []);
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
    expect(step(full, [{ type: 'gambleUnit', table: 'small' }]).rejected[0]!.reason).toBe('noSlot');
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

describe('the draw opens once the round-10 boss is gone', () => {
  test('the stage 3 data locks it at the R10 boss', () => {
    expect(locked.economy!.market!.openAfterBossRound).toBe(10);
  });

  test('locked from round 1 until the R10 boss dies', () => {
    const s = lane(1, 0, 1, locked);
    s.buckwheat = 3;
    expect(step(s, [draw]).rejected[0]?.reason).toBe('marketLocked');
    expect(marketView(s)!.gamble!.units.tables.small.why).toBe('marketLocked');
    forceRound(s, 10);
    step(s, []);
    const boss = s.enemies.find(e => e.boss)!;
    expect(step(s, [draw]).rejected[0]?.reason).toBe('marketLocked');
    boss.hp = 0;
    step(s, []);
    expect(marketView(s)!.gamble!.units.tables.small.why).toBeNull();
    expect(step(s, [draw]).rejected).toEqual([]);
  });

  test('a tamed R10 boss opens it too', () => {
    const s = lane(10, 1000, 1, locked);
    step(s, []);
    const boss = s.enemies.find(e => e.boss)!;
    s.econ!.rng.tame = { s: 0 };
    boss.hp = 1;
    for (let i = 0; i < 400 && s.enemies.some(e => e.id === boss.id); i++) {
      s.coins = 1000; s.buckwheat = 5;
      step(s, [{ type: 'tame', enemyId: boss.id }]);
      boss.hp = Math.min(boss.hp, 1);
    }
    expect(s.econ!.tamed).toContain('jinegaksi');
    expect(marketView(s)!.gamble!.units.tables.small.why).toBeNull();
  });
});
