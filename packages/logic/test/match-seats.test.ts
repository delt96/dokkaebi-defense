import { describe, expect, test } from 'vitest';
import { createGame, createMatch, loadGameData, step, stepMatch, type MatchState } from '../src/index';
import { forceRound, jumpToTick, placeUnitForTest, spawnEnemyForTest, stepMatchUntil } from '../src/testing';

const data = loadGameData('stage2');
const fill = (m: MatchState, seat: number, n: number) => { for (let i = 0; i < n; i++) spawnEnemyForTest(m.lanes[seat]!, 'japgwi', 0, 1e9); };
const reasons = (acks: { ok: boolean; reason?: string }[]) => acks.map(a => (a.ok ? 'ok' : a.reason));
const killBoss = (m: MatchState, seat: number) => { m.lanes[seat]!.enemies.find(e => e.boss)!.hp = 0; };

describe('elimination', () => {
  test('limit: 61 for 99 ticks survives, the 100th eliminates; dropping to 60 resets', () => {
    const m = createMatch(data, 1, [1, 2]); jumpToTick(m, 1000);
    fill(m, 1, 61);
    stepMatchUntil(m, 1050); m.lanes[1]!.enemies.pop(); stepMatch(m, []);
    expect(m.lanes[1]!.overLimitTicks).toBe(0);
    fill(m, 1, 1);
    stepMatchUntil(m, m.tick + 99); expect(m.seats[1]!.alive).toBe(true);
    const r = stepMatch(m, []);
    expect(m.seats[1]).toMatchObject({ alive: false, record: { cause: 'limit', round: 1, lastEnemies: 61, series: [61] } });
    expect(r.events).toContainEqual({ type: 'eliminated', seat: 1, cause: 'limit', round: 1 });
    expect(m.lanes[1]).toMatchObject({ enemies: [], fires: [], tokens: 0, coins: 0, buckwheat: 0 });
    expect(m.seats[2]!.alive).toBe(true);
  });
  test('boss clock: killing with 1 tick left passes; otherwise eliminated at 9299', () => {
    const a = createMatch(data, 1, [1]); jumpToTick(a, 7800); stepMatch(a, []);
    expect(a.seats[1]!.bosses[10]).toMatchObject({ status: 'fighting', ticksLeft: 1499 });
    stepMatchUntil(a, 9299);
    expect(a.seats[1]!.bosses[10]!.ticksLeft).toBe(1);
    killBoss(a, 1); stepMatch(a, []);
    expect(a.seats[1]).toMatchObject({ alive: true, bosses: { 10: { status: 'killed', ticksLeft: 1 } } });
    const b = createMatch(data, 1, [1]); jumpToTick(b, 7800);
    stepMatchUntil(b, 9299); expect(b.seats[1]!.alive).toBe(true);
    stepMatch(b, []);
    expect(b.seats[1]).toMatchObject({ alive: false, record: { cause: 'boss', round: 10 }, bosses: { 10: { status: 'failed', ticksLeft: 0 } } });
    expect(b.result).toMatchObject({ outcome: 'wipe', tick: 9299 });
  });
  test('limit beats boss on the same tick', () => {
    const m = createMatch(data, 1, [1, 2]); jumpToTick(m, 7800);
    stepMatchUntil(m, 9200); fill(m, 1, 61);
    stepMatchUntil(m, 9300);
    expect(m.seats[1]!.record!.cause).toBe('limit');
  });
  test('forfeit acts in step 1: no combat in that lane on that tick', () => {
    const m = createMatch(data, 1, [1, 2]); jumpToTick(m, 1000);
    placeUnitForTest(m.lanes[1]!, 'horong', 7); spawnEnemyForTest(m.lanes[1]!, 'japgwi', 3, 1e9);
    const r = stepMatch(m, [{ seat: 1, seq: 1, cmd: { type: 'forfeit' } }]);
    expect(r.acks[0]).toMatchObject({ ok: true });
    expect(m.seats[1]!.record!.cause).toBe('forfeit');
    expect(r.lanes[1]?.events.some(e => e.type === 'attack') ?? false).toBe(false);
    expect(stepMatch(m, [{ seat: 1, seq: 2, cmd: { type: 'summon' } }]).acks[0]).toMatchObject({ ok: false, reason: 'notAlive' });
  });
  test('an eliminated lane gets no spawns, tokens or coins', () => {
    const m = createMatch(data, 1, [1, 2]); jumpToTick(m, 1000);
    stepMatch(m, [{ seat: 2, seq: 1, cmd: { type: 'forfeit' } }]);
    stepMatchUntil(m, 1500);
    expect(m.lanes[2]).toMatchObject({ enemies: [], tokens: 0, coins: 0 });
  });
});

describe('disconnect', () => {
  test('D+3599 reconnect keeps the seat; D+3600 makes a spirit', () => {
    const a = createMatch(data, 1, [1, 2], { noElimination: true }); jumpToTick(a, 1000);
    stepMatch(a, [{ seat: 1, seq: 0, cmd: { type: 'disconnect' } }]);
    expect(a.seats[1]).toMatchObject({ connected: false, disconnectTick: 1000, alive: true });
    stepMatchUntil(a, 4599);
    stepMatch(a, [{ seat: 1, seq: 0, cmd: { type: 'reconnect' } }]);
    expect(a.seats[1]).toMatchObject({ connected: true, alive: true, disconnectTick: null });
    const b = createMatch(data, 1, [1, 2], { noElimination: true }); jumpToTick(b, 1000);
    stepMatch(b, [{ seat: 1, seq: 0, cmd: { type: 'disconnect' } }]);
    stepMatchUntil(b, 4600);
    const r = stepMatch(b, [{ seat: 1, seq: 0, cmd: { type: 'reconnect' } }]);
    expect(b.seats[1]).toMatchObject({ alive: false, connected: true, record: { cause: 'disconnect' } });
    expect(r.events).toContainEqual({ type: 'reconnected', seat: 1, alive: false });
  });
  test('expiry and the 100th over-limit tick on the same tick: cause disconnect', () => {
    const m = createMatch(data, 1, [1, 2]); jumpToTick(m, 1000);
    stepMatch(m, [{ seat: 1, seq: 0, cmd: { type: 'disconnect' } }]);
    stepMatchUntil(m, 4501, { clearEnemies: true });
    fill(m, 1, 61);
    stepMatchUntil(m, 4600); expect(m.seats[1]!.alive).toBe(true);
    stepMatch(m, []);
    expect(m.seats[1]!.record!.cause).toBe('disconnect');
  });
  test('disconnected on the boss round start tick: the boss still spawns on schedule and only the clock pauses', () => {
    const m = createMatch(data, 1, [1, 2], { noElimination: true }); jumpToTick(m, 7800);
    const tokens = m.lanes[1]!.tokens;
    const r = stepMatch(m, [{ seat: 1, seq: 0, cmd: { type: 'disconnect' } }]);
    expect(m.seats[1]!.connected).toBe(false);
    expect(m.lanes[1]!.enemies.filter(e => e.boss)).toHaveLength(1);
    expect(m.seats[1]!.bosses[10]).toMatchObject({ status: 'fighting', ticksLeft: 1500, pausedTicks: 1 });
    expect(r.events).toContainEqual(expect.objectContaining({ type: 'bossSpawn', seat: 1, round: 10 }));
    expect(m.lanes[1]!.tokens).toBe(tokens + 2);
  });
  test('boss clock pauses while disconnected, resumes on reconnect, and runs again after 3600 paused ticks', () => {
    const m = createMatch(data, 1, [1, 2], { noElimination: true }); jumpToTick(m, 7800); stepMatch(m, []);
    stepMatch(m, [{ seat: 1, seq: 0, cmd: { type: 'disconnect' } }]);
    expect(m.seats[1]!.bosses[10]).toMatchObject({ ticksLeft: 1499, pausedTicks: 1 });
    stepMatchUntil(m, 11400, { clearEnemies: true });
    stepMatch(m, [{ seat: 1, seq: 0, cmd: { type: 'reconnect' } }]);
    expect(m.seats[1]!.bosses[10]).toMatchObject({ ticksLeft: 1498, pausedTicks: 3599 });
    stepMatch(m, [{ seat: 1, seq: 0, cmd: { type: 'disconnect' } }]);
    expect(m.seats[1]!.bosses[10]).toMatchObject({ ticksLeft: 1498, pausedTicks: 3600 });
    stepMatch(m, []);
    expect(m.seats[1]!.bosses[10]).toMatchObject({ ticksLeft: 1497, pausedTicks: 3600 });
  });
});

describe('support', () => {
  const twoSpirits = () => {
    const m = createMatch(data, 1, [1, 2, 3]); jumpToTick(m, 1000);
    stepMatch(m, [{ seat: 2, seq: 1, cmd: { type: 'forfeit' } }, { seat: 3, seq: 1, cmd: { type: 'forfeit' } }]);
    stepMatchUntil(m, 1401);
    return m;
  };
  test('one token per round start, capped at 1, zero right after elimination', () => {
    const m = createMatch(data, 1, [1, 2]); jumpToTick(m, 1000);
    stepMatch(m, [{ seat: 2, seq: 1, cmd: { type: 'forfeit' } }]);
    expect(m.seats[2]!.supportTokens).toBe(0);
    stepMatchUntil(m, 1401); expect(m.seats[2]!.supportTokens).toBe(1);
    stepMatchUntil(m, 2201); expect(m.seats[2]!.supportTokens).toBe(1);
  });
  test('two spirits support the same survivor: the first pays, the survivor gets 5 once', () => {
    const m = twoSpirits(); const coins = m.lanes[1]!.coins;
    const r = stepMatch(m, [{ seat: 2, seq: 2, cmd: { type: 'support', target: 1 } }, { seat: 3, seq: 2, cmd: { type: 'support', target: 1 } }]);
    expect(reasons(r.acks)).toEqual(['ok', 'targetAlreadyReceived']);
    expect(m.lanes[1]!.coins).toBe(coins + 5);
    expect([m.seats[2]!.supportTokens, m.seats[3]!.supportTokens]).toEqual([0, 1]);
    expect(r.events).toContainEqual({ type: 'support', from: 2, to: 1, coins: 5 });
  });
  test('a support on the boundary tick still sees the old round limit', () => {
    const m = twoSpirits();
    stepMatch(m, [{ seat: 2, seq: 2, cmd: { type: 'support', target: 1 } }]);
    stepMatchUntil(m, 2200);
    expect(stepMatch(m, [{ seat: 3, seq: 2, cmd: { type: 'support', target: 1 } }]).acks[0]).toMatchObject({ ok: false, reason: 'targetAlreadyReceived' });
    expect(m.seats[3]!.supportTokens).toBe(1);
    expect(stepMatch(m, [{ seat: 3, seq: 3, cmd: { type: 'support', target: 1 } }]).acks[0]).toMatchObject({ ok: true });
  });
  test('rejections keep the token; a disconnected survivor can receive', () => {
    const m = twoSpirits();
    stepMatch(m, [{ seat: 1, seq: 0, cmd: { type: 'disconnect' } }]);
    const r = stepMatch(m, [
      { seat: 1, seq: 1, cmd: { type: 'support', target: 2 } },
      { seat: 2, seq: 2, cmd: { type: 'support', target: 3 } },
      { seat: 2, seq: 3, cmd: { type: 'support', target: 1 } },
      { seat: 2, seq: 4, cmd: { type: 'support', target: 1 } },
    ]);
    expect(reasons(r.acks)).toEqual(['notSpirit', 'targetNotAlive', 'ok', 'noSupportToken']);
  });
  test('target eliminated earlier in the same tick: rejected, token kept; enemy counts unchanged', () => {
    const m = createMatch(data, 1, [1, 2, 3]); jumpToTick(m, 1000);
    stepMatch(m, [{ seat: 3, seq: 1, cmd: { type: 'forfeit' } }]); stepMatchUntil(m, 1401);
    const before = m.lanes[1]!.enemies.length;
    const r = stepMatch(m, [{ seat: 2, seq: 1, cmd: { type: 'forfeit' } }, { seat: 3, seq: 2, cmd: { type: 'support', target: 2 } }, { seat: 3, seq: 3, cmd: { type: 'support', target: 1 } }]);
    expect(reasons(r.acks)).toEqual(['ok', 'targetNotAlive', 'ok']);
    expect(m.lanes[1]!.enemies.length).toBe(before);
  });
});

describe('team result', () => {
  const atFinal = (seats: number[]) => {
    const m = createMatch(data, 1, seats);
    for (const s of seats) m.seats[s]!.bosses[10]!.status = 'killed';
    jumpToTick(m, 16500); stepMatch(m, []);
    return m;
  };
  test('every survivor disconnected at 17999 without gangcheori: one wipe, seat unfinished', () => {
    const m = atFinal([1]);
    stepMatch(m, [{ seat: 1, seq: 0, cmd: { type: 'disconnect' } }]);
    const rs = stepMatchUntil(m, 18000);
    expect(m.result).toMatchObject({ outcome: 'wipe', tick: 17999, alive: 1, started: 1, seats: [{ seat: 1, outcome: 'unfinished' }] });
    expect(rs.flatMap(r => r.events).filter(e => e.type === 'ended').length).toBe(1);
  });
  test('gangcheori killed but limit-eliminated on 17999: wipe', () => {
    const m = atFinal([1]); stepMatchUntil(m, 17900); fill(m, 1, 61);
    stepMatchUntil(m, 17999); killBoss(m, 1); stepMatch(m, []);
    expect(m.result).toMatchObject({ outcome: 'wipe', seats: [{ seat: 1, outcome: 'eliminated', cause: 'limit' }] });
  });
  test('two seats out on the same tick: one wipe; later inputs are refused and time stops', () => {
    const m = createMatch(data, 1, [1, 2]); jumpToTick(m, 1000);
    const r = stepMatch(m, [{ seat: 1, seq: 1, cmd: { type: 'forfeit' } }, { seat: 2, seq: 1, cmd: { type: 'forfeit' } }]);
    expect(m.result).toMatchObject({ outcome: 'wipe', tick: 1000, alive: 0, started: 2 });
    expect(r.events.filter(e => e.type === 'ended').length).toBe(1);
    expect(stepMatch(m, [{ seat: 1, seq: 2, cmd: { type: 'summon' } }]).acks[0]).toMatchObject({ ok: false, reason: 'ended' });
    expect(m.tick).toBe(1001);
  });
  test('early clear once every survivor has both bosses down (decision 4)', () => {
    const m = atFinal([1, 2]);
    killBoss(m, 1); stepMatch(m, []); expect(m.result).toBeNull();
    killBoss(m, 2); stepMatch(m, []);
    expect(m.result).toMatchObject({ outcome: 'clear', tick: 16502, seats: [{ seat: 1, outcome: 'finished' }, { seat: 2, outcome: 'finished' }] });
  });
  test('at 17999 one finisher among the survivors is enough for clear; the other is unfinished', () => {
    const m = atFinal([1, 2]);
    killBoss(m, 1); stepMatch(m, []);
    const rs = stepMatchUntil(m, 18000, { inputs: t => (t === 16502 ? [{ seat: 2, seq: 0, cmd: { type: 'disconnect' } }] : []) });
    expect(m.result).toMatchObject({ outcome: 'clear', tick: 17999, alive: 2, seats: [{ seat: 1, outcome: 'finished' }, { seat: 2, outcome: 'unfinished' }] });
    expect(rs.flatMap(r => r.events).filter(e => e.type === 'ended').length).toBe(1);
  });
  test('coop 1-player clears on the round-20 kill; stage 1 still clears on its final kill', () => {
    const m = atFinal([1]); killBoss(m, 1); stepMatch(m, []);
    expect(m.result).toMatchObject({ outcome: 'clear', tick: 16501 });
    const s = createGame(loadGameData(), 1); forceRound(s, 20); step(s, []);
    s.enemies.find(e => e.boss)!.hp = 0; step(s, []);
    expect(s.result).toEqual({ outcome: 'clear', reason: null, round: 20 });
  });
});
