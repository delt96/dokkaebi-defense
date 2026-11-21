import { describe, expect, test } from 'vitest';
import {
  buildFull, createMatch, createRng, deriveSeed, gateDeadlineTick, loadGameData, roundStartTick, stepMatch,
  type GameEvent, type MatchState,
} from '../src/index';
import { allBossesKilled, bossRounds } from '../src/match/seats';
import { jumpToTick, placeUnitForTest, spawnEnemyForTest, stepMatchUntil } from '../src/testing';

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
    expect(m.econ).toMatchObject({ team: { streak: 0, paid: false }, ssireumSeat: null });
    expect('offers' in m.econ!).toBe(false);
    expect(d3.coop!.yeoksin.map(y => [y.stage, y.startRound, y.deadlineRound, y.baseHp, y.startIndex])).toEqual([
      [1, 6, 9, 8000, 0], [2, 15, 19, 30000, 1], [3, 35, 39, 109000, 2], [4, 55, 59, 210000, 3],
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

  test('third yeoksin spawns at round 35 with 163500 hp for six starters at ring index 2; missing it fails the gate at the end of 39', () => {
    const m = createMatch(d3, 1, SIX);
    jumpToTick(m, rst(35));
    const r = stepMatch(m, []);
    expect(r.events).toContainEqual({ type: 'yeoksinSpawn', stage: 3, maxHp: 163500 });
    expect(r.events.find(e => e.type === 'yeoksinEnter')).toMatchObject({ stage: 3, seat: 3 });

    const g = createMatch(d3, 1, SIX);
    jumpToTick(g, gateDeadlineTick(d3, 3));
    expect(g.yeoksinKills).toBe(2);
    stepMatch(g, []);
    expect(g.result?.outcome).toBe('gate');
  });

  test('a new yeoksin visit resets the previous visit\'s target streak', () => {
    const m = createMatch(d3, 1, [1]);
    jumpToTick(m, rst(6));
    stepMatch(m, []);
    const enemy = m.yeoksin!.enemy;
    const unit = placeUnitForTest(m.lanes[1]!, 'oedaridokkaebi', 0);
    unit.streak = { enemyId: enemy.id, count: 2 };
    m.tick = rst(6) + 240;
    const r = stepMatch(m, []);
    expect(r.events.some(e => e.type === 'yeoksinEnter')).toBe(true);
    expect(unit.streak).toEqual({ enemyId: enemy.id, count: 1 });
  });

  test('noGate keeps the match going past a failed gate', () => {
    const m = createMatch(d3, 1, SIX, { noGate: true });
    jumpToTick(m, gateDeadlineTick(d3, 3));
    stepMatch(m, []);
    expect(m.result).toBeNull();
    stepMatch(m, []);
    expect(m.round).toBe(40);
  });

  test('noGate takes a yeoksin still alive at its deadline off the board without a kill or reward', () => {
    const m = createMatch(d3, 1, SIX, { noGate: true });
    jumpToTick(m, rst(35));
    const deadline = gateDeadlineTick(d3, 3);
    const steps = stepMatchUntil(m, deadline, { clearEnemies: true });
    expect(m.yeoksin?.stage).toBe(3);
    const seat = m.yeoksin!.seat!;
    expect(m.lanes[seat]!.enemies.some(e => e.id === -3)).toBe(true);
    expect(steps.flatMap(r => r.events).some(e => e.type === 'yeoksinKilled')).toBe(false);
    const coins = SIX.map(s => m.lanes[s]!.coins);
    const buckwheat = SIX.map(s => m.lanes[s]!.buckwheat);

    const last = stepMatch(m, []);
    expect(last.tick).toBe(deadline);
    expect(m.result).toBeNull();
    expect(m.yeoksin).toBeNull();
    expect(m.yeoksinKills).toBe(2);
    expect(last.events).toContainEqual({ type: 'yeoksinLeave', stage: 3, seat });
    for (const s of SIX) expect(m.lanes[s]!.enemies.some(e => e.id === -3)).toBe(false);
    const roundEnd = d3.balance.coins.roundEnd;
    expect(SIX.map(s => m.lanes[s]!.coins)).toEqual(coins.map(c => c + roundEnd));
    expect(SIX.map(s => m.lanes[s]!.buckwheat)).toEqual(buckwheat);

    stepMatchUntil(m, rst(41), { clearEnemies: true });
    expect(m.round).toBe(40);
    expect(m.yeoksin).toBeNull();
    for (const s of SIX) expect(m.lanes[s]!.enemies.some(e => e.id === -3)).toBe(false);
  });

  test('noGate still counts a yeoksin killed on its deadline tick', () => {
    const m = createMatch(d3, 1, SIX, { noGate: true });
    jumpToTick(m, rst(35));
    stepMatchUntil(m, gateDeadlineTick(d3, 3), { clearEnemies: true });
    m.yeoksin!.enemy.hp = 0;
    const r = stepMatch(m, []);
    expect(r.events.some(e => e.type === 'yeoksinKilled' && e.stage === 3)).toBe(true);
    expect(r.events.some(e => e.type === 'yeoksinLeave')).toBe(false);
    expect(m.yeoksinKills).toBe(3);
  });

  test('forfeiting closes the active mission and clears event records from the personal snapshot', () => {
    const m = createMatch(d3, 1, [1, 2]);
    const round = d3.economy!.mission!.round;
    jumpToTick(m, rst(round));
    stepMatch(m, []);
    m.lanes[1]!.coins = d3.economy!.mission!.fee;
    const enter = stepMatch(m, [{ seat: 1, seq: 1, cmd: { type: 'missionEnter' } }]);
    expect(enter.acks[0]?.ok).toBe(true);
    const snapshot = () => buildFull(m, 1, { watching: 2, names: {}, key: 'k', n: 0 }).mine.econ;
    expect(snapshot()).toMatchObject({ mission: { phase: 'active' }, events: [{ kind: 'beast' }] });

    stepMatch(m, [{ seat: 1, seq: 2, cmd: { type: 'forfeit' } }]);
    stepMatch(m, [{ seat: 1, seq: 0, cmd: { type: 'reconnect' } }]);
    expect(snapshot()).toMatchObject({ mission: { phase: 'lost', beastId: null, beastDown: false }, events: [] });
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
    m.lanes[6]!.econ!.ledger = { tokens: 20 };
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

describe('quest outcomes in a match', () => {
  const rec = (m: MatchState, seat: number, id: string) => (m.lanes[seat]!.econ!.questResults as Record<string, unknown>)[id];

  test('team: last total, survivors and streak are kept; a capped seat is told so with payout 0', () => {
    const m = teamMatch();
    m.lanes[6]!.econ!.ledger = { tokens: 20 };
    nightWith(m, 21, eight(SIX));
    expect(rec(m, 1, 'team')).toMatchObject({ outcome: 'active', progress: { remaining: 48, survivors: 6, streak: 1 } });
    nightWith(m, 22, eight(SIX));
    nightWith(m, 23, eight(SIX));
    expect(rec(m, 1, 'team')).toEqual({ outcome: 'won', reward: { coins: 0, buckwheat: 0, tokens: 1 }, progress: { remaining: 48, survivors: 6, streak: 3 } });
    expect(rec(m, 6, 'team')).toMatchObject({ outcome: 'capped', reward: { tokens: 0 } });
    nightWith(m, 24, eight(SIX));
    expect(rec(m, 1, 'team')).toMatchObject({ outcome: 'won' });
    const r = teamMatch();
    nightWith(r, 29, eight(SIX, { 1: 5 }));
    expect(rec(r, 1, 'team')).toMatchObject({ outcome: 'timedOut', progress: { remaining: 53, streak: 0 } });
  });

  test('ssireum: the winner, the other seats and a flight are recorded apart, and survive a fresh full', () => {
    const m = createMatch(d3, 7, [1, 2, 3]);
    jumpToTick(m, rst(32));
    stepMatch(m, []);
    const winner = m.econ!.ssireumSeat!;
    const others = [1, 2, 3].filter(s => s !== winner);
    expect(rec(m, winner, 'ssireum')).toMatchObject({ outcome: 'active', progress: { winnerSeat: winner } });
    for (const s of others) expect(rec(m, s, 'ssireum')).toMatchObject({ outcome: 'otherSeat', progress: { winnerSeat: winner } });
    for (let k = 0; k < 401; k++) stepMatch(m, []);
    expect(rec(m, winner, 'ssireum')).toMatchObject({ outcome: 'fled', reward: { buckwheat: 0 } });
    const full = buildFull(m, winner, { watching: winner, names: {}, key: 'k', n: 0 });
    expect(full.mine.econ!.questResults.ssireum).toMatchObject({ outcome: 'fled' });
  });

  test('an elimination closes the active quests of that seat', () => {
    const m = createMatch(d3, 2, [1, 2]);
    jumpToTick(m, rst(12) + 1);
    m.lanes[1]!.coins = 100;
    stepMatch(m, [{ seat: 1, seq: 1, cmd: { type: 'missionEnter' } }]);
    stepMatch(m, [{ seat: 1, seq: 2, cmd: { type: 'forfeit' } }]);
    expect(rec(m, 1, 'mission')).toMatchObject({ outcome: 'eliminated' });
  });
});
