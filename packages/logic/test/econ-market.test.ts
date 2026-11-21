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

/** Buys one bundle, returning the new unit's grade (frees the board first so slots never run out). */
function pullBundle(s: GameState): number {
  for (let i = 0; i < s.slots.length; i++) s.slots[i] = null;
  const before = s.econ!.bundle.bought;
  if (before >= s.data.economy!.market!.bundle.perDay) { s.econ!.bundle.bought = 0; }
  const r = step(s, [{ type: 'buy', item: 'bundle' }]);
  expect(r.rejected).toEqual([]);
  const u = units(s);
  expect(u.length).toBe(1);
  return gradeOf(s.data, u[0]!.defId);
}

describe('bundle', () => {
  test('bundle: closed in prep, 55 coins per pull, three per market day, resets on day 2', () => {
    const s = lane(0);
    expect(step(s, [{ type: 'buy', item: 'bundle' }]).rejected[0]!.reason).toBe('marketClosed');
    forceRound(s, 1);
    expect(marketDay(s)).toBe(1);
    const r = step(s, Array.from({ length: 4 }, () => ({ type: 'buy', item: 'bundle' }) as const));
    expect(r.rejected.map(x => x.reason)).toEqual(['soldOut']);
    const kills = r.events.filter(e => e.type === 'kill').length;
    expect(s.coins).toBe(1000 - 3 * 55 + kills * s.data.balance.coins.perKill);
    expect(r.events.filter(e => e.type === 'buy').length).toBe(3);
    expect(r.events.filter(e => e.type === 'summon').length).toBe(3);
    forceRound(s, 10);
    expect(step(s, [{ type: 'buy', item: 'bundle' }]).rejected[0]!.reason).toBe('soldOut');
    forceRound(s, 11);
    expect(marketDay(s)).toBe(2);
    expect(step(s, [{ type: 'buy', item: 'bundle' }]).rejected).toEqual([]);
    const poor = lane(1, 54);
    expect(step(poor, [{ type: 'buy', item: 'bundle' }]).rejected[0]!.reason).toBe('noCoins');
  });

  test('bundle deck: every 3 pulls are {3,3,2}, 12 pulls are worth 40, and grade 2 is never followed by grade 2 within a deck', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const s = lane(1, 100000, seed);
      const grades = Array.from({ length: 12 }, () => pullBundle(s));
      for (let i = 0; i < 12; i += 3) expect(grades.slice(i, i + 3).sort()).toEqual([2, 3, 3]);
      expect(grades.reduce((a, g) => a + 2 ** (g - 1), 0)).toBe(40);
    }
  });

  test('across a deck boundary two grade-2 pulls in a row are followed by a grade 3', () => {
    let found = 0;
    for (let seed = 1; seed <= 200 && found < 3; seed++) {
      const s = lane(1, 100000, seed);
      const g = Array.from({ length: 6 }, () => pullBundle(s));
      if (g[2] === 2 && g[3] === 2) { expect(g[4]).toBe(3); expect(g[5]).toBe(3); found++; }
    }
    expect(found).toBeGreaterThan(0);
  });

  test('bundle units cost their grade value and are normal units', () => {
    const s = lane(1);
    step(s, [{ type: 'buy', item: 'bundle' }]);
    const u = units(s)[0]!;
    expect(u.cost).toBe(2 ** (gradeOf(d3, u.defId) - 1));
    expect(d3.units.find(x => x.id === u.defId)!.hidden).toBeUndefined();
  });

  test('bundle with no empty open slot is refused before payment', () => {
    const s = lane(1, 55);
    fillOpen(s);
    const bundle = structuredClone(s.econ!.bundle);
    const rng = { ...s.econ!.rng.bundle };
    const jige = { ...s.econ!.rng.jige };
    expect(step(s, [{ type: 'buy', item: 'bundle' }]).rejected[0]!.reason).toBe('noSlot');
    expect(s.coins).toBe(55);
    expect(s.econ!.bundle).toEqual(bundle);
    expect(s.econ!.rng.bundle).toEqual(rng);
    expect(s.econ!.rng.jige).toEqual(jige);
  });

  test('buying never touches the summon or combat streams or the pity counters', () => {
    const s = lane(1);
    const before = canonicalJson({ r: s.rng, g: s.grade1Summons, c: s.summonCounts });
    for (const item of ['bundle', 'jar', 'jar', 'bundle'] as const) applyCommand(s, { type: 'buy', item }, []);
    expect(units(s).length).toBeGreaterThan(1);
    expect(canonicalJson({ r: s.rng, g: s.grade1Summons, c: s.summonCounts })).toBe(before);
  });
});

/** Finds a seed whose first jar roll hits (`hit`) or misses. */
function jarSeed(hit: boolean): number {
  for (let seed = 1; seed < 200; seed++) {
    const s = lane(1, 35, seed);
    step(s, [{ type: 'buy', item: 'jar' }]);
    if ((s.buckwheat === 1) === hit) return seed;
  }
  throw new Error('no seed');
}

describe('buckwheat jar', () => {
  test('jar: miss gives a grade-1 unit and then a guaranteed buckwheat; a hit closes the period', () => {
    const s = lane(1, 1000, jarSeed(false));
    const r1 = step(s, [{ type: 'buy', item: 'jar' }]);
    expect(s.buckwheat).toBe(0);
    expect(units(s).map(u => gradeOf(d3, u.defId))).toEqual([1]);
    expect(units(s)[0]!.cost).toBe(1);
    expect(s.econ!.jar.missed).toBe(true);
    expect(r1.events.find(e => e.type === 'buy')).toMatchObject({ item: 'jar', buckwheat: 0 });
    step(s, [{ type: 'buy', item: 'jar' }]);
    expect(s.buckwheat).toBe(1);
    expect(s.coins).toBe(1000 - 70);
    expect(step(s, [{ type: 'buy', item: 'jar' }]).rejected[0]!.reason).toBe('soldOut');
    forceRound(s, 11);
    expect(marketView(s)!.jar.chance).toBe(0.5);
    expect(step(s, [{ type: 'buy', item: 'jar' }]).rejected).toEqual([]);
  });

  test('two jar buys in one tick with 70 coins', () => {
    const hit = lane(1, 70, jarSeed(true));
    const r = step(hit, [{ type: 'buy', item: 'jar' }, { type: 'buy', item: 'jar' }]);
    expect(r.rejected.map(x => x.reason)).toEqual(['soldOut']);
    expect([hit.coins, hit.buckwheat]).toEqual([35, 1]);
    const miss = lane(1, 70, jarSeed(false));
    expect(step(miss, [{ type: 'buy', item: 'jar' }, { type: 'buy', item: 'jar' }]).rejected).toEqual([]);
    expect([miss.coins, miss.buckwheat, units(miss).length]).toEqual([0, 1, 1]);
  });

  test('jar first draw needs a free slot but the guaranteed draw does not', () => {
    const full = lane(1, 100, jarSeed(true));
    fillOpen(full);
    const rng = { ...full.econ!.rng.jar };
    expect(step(full, [{ type: 'buy', item: 'jar' }]).rejected[0]!.reason).toBe('noSlot');
    expect([full.coins, full.econ!.rng.jar]).toEqual([100, rng]);
    const s = lane(1, 100, jarSeed(false));
    step(s, [{ type: 'buy', item: 'jar' }]);
    fillOpen(s);
    expect(step(s, [{ type: 'buy', item: 'jar' }]).rejected).toEqual([]);
    expect(s.buckwheat).toBe(1);
  });

  test('jar period 20 / 2 per period from data allows two full jars in rounds 1-20', () => {
    const d = makeData(x => { x.economy!.market!.jar.periodRounds = 20; x.economy!.market!.jar.perPeriod = 2; }, 'stage3');
    const s = lane(1, 10000, 1, d);
    for (let i = 0; i < 4; i++) step(s, [{ type: 'buy', item: 'jar' }]);
    expect(s.buckwheat).toBe(2);
    forceRound(s, 15);
    expect(step(s, [{ type: 'buy', item: 'jar' }]).rejected[0]!.reason).toBe('soldOut');
    forceRound(s, 21);
    expect(step(s, [{ type: 'buy', item: 'jar' }]).rejected).toEqual([]);
  });

  test('jige arrives at most once and stops rolling after it came', () => {
    let seen = false;
    for (let seed = 1; seed <= 100 && !seen; seed++) {
      const s = lane(1, 100000, seed);
      for (let i = 0; i < 12 && !s.econ!.jige; i++) {
        s.slots.fill(null); s.econ!.bundle.bought = 0;
        const r = step(s, [{ type: 'buy', item: 'bundle' }]);
        const ev = r.events.find(e => e.type === 'buy')!;
        expect(ev).toMatchObject({ jige: s.econ!.jige });
      }
      if (!s.econ!.jige) continue;
      seen = true;
      const rng = { ...s.econ!.rng.jige };
      s.slots.fill(null); s.econ!.bundle.bought = 0;
      const r = step(s, [{ type: 'buy', item: 'bundle' }]);
      expect(s.econ!.rng.jige).toEqual(rng);
      expect(r.events.find(e => e.type === 'buy')).toMatchObject({ jige: false });
    }
    expect(seen).toBe(true);
  });

  test('a lane without a market section rejects buys as closed', () => {
    const d = makeData(x => { delete x.economy!.market; }, 'stage3');
    const s = lane(1, 1000, 1, d);
    expect(step(s, [{ type: 'buy', item: 'jar' }]).rejected[0]!.reason).toBe('marketClosed');
    expect(marketView(s)).toBeNull();
  });
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
      stepMatch(a, buy ? [{ seat: 1, seq: 0, cmd: { type: 'buy', item: 'bundle' } }] : []);
      stepMatch(b, []);
    }
    expect(a.lanes[1]!.coins).not.toBe(b.lanes[1]!.coins);
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
    expect(step(full, [{ type: 'buy', item: 'bundle' }]).rejected[0]!.reason).toBe('noSlot');
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

  test('marketView shows real remaining odds and the 60-coin shortfall for a story target', () => {
    const s = lane(1, 100);
    expect(marketView(s)).toMatchObject({ bundle: { price: 55, left: 3, odds: { 3: 2 / 3, 2: 1 / 3 } }, jar: { price: 35, left: 1, chance: 0.5 }, shortAfter: null });
    s.econ!.bundle.left = [3, 3];
    expect(marketView(s)!.bundle.odds).toEqual({ 3: 1, 2: 0 });
    s.econ!.story.target = 'cheonnyeonjing';
    expect(marketView(s)!.shortAfter).toEqual({ bundle: 15, jar: 0 });
    s.coins = 200;
    expect(marketView(s)!.shortAfter).toEqual({ bundle: 0, jar: 0 });
  });
});
