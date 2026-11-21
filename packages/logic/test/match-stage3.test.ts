import { describe, expect, test } from 'vitest';
import {
  createMatch, createRng, deriveSeed, gateDeadlineTick, loadGameData, roundStartTick, stepMatch,
  type GameEvent, type MatchState,
} from '../src/index';
import { allBossesKilled, bossRounds } from '../src/match/seats';
import { jumpToTick, placeUnitForTest, spawnEnemyForTest } from '../src/testing';

const d2 = loadGameData('stage2');
const d3 = loadGameData('stage3');
const rst = (r: number) => roundStartTick(d3, r);
const SIX = [1, 2, 3, 4, 5, 6];

describe('stage 3 match schedule', () => {
  test('stage 2 matches keep boss keys 10/20, two yeoksin slots, no econ', () => {
    const m = createMatch(d2, 3, [1, 2]);
    expect(Object.keys(m.seats[1]!.bosses)).toEqual(['10', '20']);
    expect(m.seats[1]!.yeoksinDamage).toEqual([0, 0]);
    expect('econ' in m).toBe(false);
    expect('econ' in m.lanes[1]!).toBe(false);
    expect(bossRounds(d2)).toEqual([10, 20]);
    expect(d2.coop!.yeoksin.map(y => y.baseHp)).toEqual([10700, 33000]);
  });

  test('stage 3 matches have six boss clocks, four yeoksin slots and a match econ seeded from the match seed', () => {
    const m = createMatch(d3, 3, [1, 2]);
    expect(Object.keys(m.seats[1]!.bosses)).toEqual(['10', '20', '30', '40', '50', '60']);
    expect(m.seats[1]!.yeoksinDamage).toEqual([0, 0, 0, 0]);
    expect(m.econ!.rng.s).toBe(createRng(deriveSeed(3, 'econ')).s);
    expect(m.econ).toMatchObject({ team: { streak: 0, paid: false }, ssireumSeat: null, offers: [], readyRound: {}, rewarded: [] });
    expect(d3.coop!.yeoksin.map(y => [y.stage, y.startRound, y.deadlineRound, y.baseHp, y.startIndex])).toEqual([
      [1, 6, 9, 8000, 0], [2, 15, 19, 30000, 1], [3, 35, 39, 90000, 2], [4, 55, 59, 210000, 3],
    ]);
  });

  test('a round-30 boss alive at time-out eliminates the seat; finished needs all six bosses', () => {
    const m = createMatch(d3, 1, [1, 2]);
    jumpToTick(m, rst(30));
    const r = stepMatch(m, []);
    expect(r.events.filter(e => e.type === 'bossSpawn').map(e => (e as { round: number }).round)).toEqual([30, 30]);
    m.lanes[2]!.enemies.find(e => e.boss)!.hp = 0;
    const out: { type: string }[] = [];
    while (m.tick < rst(31) && !m.result) out.push(...stepMatch(m, []).events);
    expect(out).toContainEqual({ type: 'bossKilled', seat: 2, round: 30 });
    expect(out).toContainEqual({ type: 'eliminated', seat: 1, cause: 'boss', round: 30 });
    expect(m.seats[2]!.alive).toBe(true);
    expect(allBossesKilled(m, 2)).toBe(false);
    for (const k of [10, 20, 40, 50]) m.seats[2]!.bosses[k]!.status = 'killed';
    expect(allBossesKilled(m, 2)).toBe(false);
    m.seats[2]!.bosses[60]!.status = 'killed';
    expect(allBossesKilled(m, 2)).toBe(true);
  });

  test('third yeoksin spawns at round 35 with 135000 hp for six starters at ring index 2; missing it fails the gate at the end of 39', () => {
    const m = createMatch(d3, 1, SIX);
    jumpToTick(m, rst(35));
    const r = stepMatch(m, []);
    expect(r.events).toContainEqual({ type: 'yeoksinSpawn', stage: 3, maxHp: 135000 });
    expect(r.events.find(e => e.type === 'yeoksinEnter')).toMatchObject({ stage: 3, seat: 3 });

    const g = createMatch(d3, 1, SIX);
    jumpToTick(g, gateDeadlineTick(d3, 3));
    expect(g.yeoksinKills).toBe(2);
    stepMatch(g, []);
    expect(g.result?.outcome).toBe('gate');
  });

  test('noGate keeps the match going past a failed gate', () => {
    const m = createMatch(d3, 1, SIX, { noGate: true });
    jumpToTick(m, gateDeadlineTick(d3, 3));
    stepMatch(m, []);
    expect(m.result).toBeNull();
    stepMatch(m, []);
    expect(m.round).toBe(40);
  });

  test('story settlement sees coins before the round-end 10', () => {
    for (const [coins, reason, after] of [[59, 'funds', 69], [60, 'award', 10]] as const) {
      const m = createMatch(d3, 1, [1]);
      const lane = m.lanes[1]!;
      placeUnitForTest(lane, 'janggu', 0); placeUnitForTest(lane, 'moru', 1);
      for (let i = 6; i < 9; i++) placeUnitForTest(lane, 'top', i);
      lane.econ!.story.target = 'cheonnyeonjing';
      lane.econ!.story.log = [28, 29].map(round => ({ round, target: 'cheonnyeonjing', missing: 1 }));
      jumpToTick(m, rst(31));
      const r = stepMatch(m, []);
      expect(r.lanes[1]!.events.some(e => e.type === 'storyOffer')).toBe(true);
      lane.coins = coins; lane.buckwheat = 1; lane.econ!.roundKills = 20;
      jumpToTick(m, rst(32) - 1);
      const end = stepMatch(m, []);
      expect(end.lanes[1]!.events).toContainEqual({ type: 'storyEnd', target: 'cheonnyeonjing', reason });
      expect(lane.coins).toBe(after);
    }
  });
});

function teamMatch(seats = SIX): MatchState {
  const m = createMatch(d3, 1, seats);
  for (const s of seats) {
    const u = placeUnitForTest(m.lanes[s]!, 'jipsin', 17);
    u.cost = 12;
    u.cooldown = 1e9;
  }
  return m;
}

function nightWith(m: MatchState, round: number, counts: Record<number, number>): GameEvent[] {
  jumpToTick(m, rst(round + 1) - 1);
  for (const [seat, n] of Object.entries(counts)) {
    const lane = m.lanes[Number(seat)]!;
    for (let i = 0; i < n; i++) spawnEnemyForTest(lane, 'japgwi', 2);
  }
  const r = stepMatch(m, []);
  return Object.values(r.lanes).flatMap(l => l.events);
}

const eight = (seats: number[], extra: Record<number, number> = {}) =>
  Object.fromEntries(seats.map(s => [s, 8 + (extra[s] ?? 0)]));

describe('team request and ssireum', () => {
  test('team request: three nights at or under survivors × 8 pay each survivor one quest token; 49 of 48 resets', () => {
    const m = teamMatch();
    m.lanes[6]!.econ!.ledger = { story: 16, tokens: 4 };
    const tokens = SIX.map(s => m.lanes[s]!.tokens);
    nightWith(m, 21, eight(SIX));
    nightWith(m, 22, eight(SIX));
    expect(m.econ!.team.streak).toBe(2);
    const ev = nightWith(m, 23, eight(SIX));
    expect(m.econ!.team).toEqual({ streak: 3, paid: true });
    for (const s of [1, 2, 3, 4, 5]) {
      const lane = m.lanes[s]!;
      expect(lane.tokens).toBe(tokens[s - 1]! + 1);
      expect(lane.econ!.questTokens).toBe(1);
      expect(lane.econ!.ledger.tokens).toBe(4);
    }
    expect(m.lanes[6]!.econ!.questTokens).toBe(0);
    expect(m.lanes[6]!.tokens).toBe(tokens[5]);
    expect(ev.filter(e => e.type === 'questReward').length).toBe(5);
    nightWith(m, 24, eight(SIX));
    expect(m.lanes[1]!.econ!.questTokens).toBe(1);

    const r = teamMatch();
    nightWith(r, 21, eight(SIX));
    nightWith(r, 22, eight(SIX, { 3: 1 }));
    expect(r.econ!.team.streak).toBe(0);
    nightWith(r, 23, eight(SIX));
    expect(r.econ!.team).toEqual({ streak: 1, paid: false });
    nightWith(r, 20 + 10, eight(SIX));
    expect(r.econ!.team.streak).toBe(1);
  });

  test('team threshold follows the survivors: three survivors → 24', () => {
    const m = teamMatch();
    jumpToTick(m, rst(21));
    stepMatch(m, [4, 5, 6].map(seat => ({ seat, seq: 0, cmd: { type: 'forfeit' as const } })));
    nightWith(m, 21, eight([1, 2, 3]));
    expect(m.econ!.team.streak).toBe(1);
    nightWith(m, 22, eight([1, 2, 3], { 1: 1 }));
    expect(m.econ!.team.streak).toBe(0);
  });

  test('ssireum goes to one connected survivor chosen by the match econ stream; none → skipped', () => {
    const drawn = (seed: number, disconnected: number[] = []) => {
      const m = createMatch(d3, seed, [1, 2, 3]);
      const summon = [1, 2, 3].map(s => m.lanes[s]!.rng.summon.s);
      jumpToTick(m, rst(32));
      const r = stepMatch(m, disconnected.map(seat => ({ seat, seq: 0, cmd: { type: 'disconnect' as const } })));
      const draw = r.events.find(e => e.type === 'ssireumDraw') as { seat: number } | undefined;
      expect([1, 2, 3].map(s => m.lanes[s]!.rng.summon.s)).toEqual(summon);
      return { m, seat: draw?.seat ?? null };
    };
    const a = drawn(7);
    expect(a.seat).toBe(drawn(7).seat);
    expect(a.m.econ!.ssireumSeat).toBe(a.seat);
    expect(a.m.lanes[a.seat!]!.enemies.some(e => e.defId === 'ev_ssireum')).toBe(true);
    const seen = new Set<number>();
    for (let seed = 1; seed <= 50; seed++) {
      const s = drawn(seed, [2]).seat!;
      expect(s).not.toBe(2);
      seen.add(s);
    }
    expect(seen).toEqual(new Set([1, 3]));
    const none = createMatch(d3, 4, [1, 2]);
    const rng = none.econ!.rng.s;
    jumpToTick(none, rst(32));
    const r = stepMatch(none, [1, 2].map(seat => ({ seat, seq: 0, cmd: { type: 'disconnect' as const } })));
    expect(r.events.some(e => e.type === 'ssireumDraw')).toBe(false);
    expect(none.econ!.rng.s).toBe(rng);
  });
});
