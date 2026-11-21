import { describe, expect, test } from 'vitest';
import { loadGameData, matchHash, replayMatch, roundStartTick } from '@dorandi/logic';
import { placeUnitForTest, spawnEnemyForTest } from '@dorandi/logic/testing';
import { FakeLink, send, started, tickOnce, ticks } from './helpers';

const data = loadGameData('stage2');
const settle = () => new Promise(r => setTimeout(r, 0));

describe('rejoin and result', () => {
  test('D+3599 rejoin stays alive; D+3600 returns as a spirit', () => {
    const one = started(['가', '나'], { dev: true }, { devNoElimination: true });
    const key = one.links[0]!.last('full').me.key;
    one.core.leave('a', false); tickOnce(one.core, one.deps);   // D = 0
    expect(one.core.match!.seats[1]).toMatchObject({ connected: false, disconnectTick: 0 });
    ticks(one, 3599 - 1);
    const a2 = new FakeLink('a2'); one.core.join(a2, { rejoinKey: key }); tickOnce(one.core, one.deps);   // tick 3599
    expect(one.core.match!.seats[1]).toMatchObject({ alive: true, connected: true });
    expect(a2.last('full')).toMatchObject({ me: { seat: 1 } }); expect(a2.last('full').me.key).not.toBe(key);
    const two = started(['가', '나'], { dev: true }, { devNoElimination: true });
    const key2 = two.links[0]!.last('full').me.key;
    two.core.leave('a', false); tickOnce(two.core, two.deps); ticks(two, 3600 - 1);
    const a3 = new FakeLink('a3'); two.core.join(a3, { rejoinKey: key2 }); tickOnce(two.core, two.deps);
    expect(two.core.match!.seats[1]).toMatchObject({ alive: false, record: { cause: 'disconnect' } });
    expect(a3.last('full')).toMatchObject({ me: { seat: 1 } });
  });

  test('while disconnected the lane keeps fighting, earning and can be eliminated', () => {
    const roundEnd = roundStartTick(data, 2);
    const r = started(['가', '나'], { dev: true }, { devJumpTick: roundEnd - 220 });
    const { core, deps } = r;
    const lane = core.match!.lanes[1]!;
    placeUnitForTest(lane, 'horong', 0);
    const target = spawnEnemyForTest(lane, 'japgwi', 3, 10 ** 6);
    core.leave('a', false); tickOnce(core, deps);
    expect(core.match!.seats[1]!.connected).toBe(false);
    const coins = lane.coins;
    ticks(r, 200);
    expect(target.hp).toBeLessThan(10 ** 6);
    expect(lane.enemies).toContain(target);
    expect(core.match!.round).toBe(1);
    ticks(r, 30);
    expect(core.match!.round).toBe(2);
    expect(lane.coins).toBeGreaterThanOrEqual(coins + data.balance.coins.roundEnd);
    for (let i = 0; i < 61; i++) spawnEnemyForTest(lane, 'japgwi', 12, 10 ** 9);
    ticks(r, 100);
    expect(core.match!.seats[1]).toMatchObject({ alive: false, record: { cause: 'limit' } });
  });

  test('disconnects and rejoins go into the input log, one entry per tick, and the log replays the match (review checkpoint, finding 4)', () => {
    const { core, deps, links: [a] } = started(['가', '나'], { dev: true }, { seed: 7 });
    send(core, 'a', 1, 'summon'); send(core, 'b', 1, 'summon'); tickOnce(core, deps);
    send(core, 'a', 2, 'summon'); tickOnce(core, deps);
    ticks({ core, deps }, 20);
    const key = a!.last('full').me.key;
    const leaveTick = core.match!.tick;
    core.leave('a', false); tickOnce(core, deps);
    ticks({ core, deps }, 300);
    const rejoinTick = core.match!.tick;
    const a2 = new FakeLink('a2'); core.join(a2, { rejoinKey: key }); tickOnce(core, deps);
    const key2 = a2.last('full').me.key;
    ticks({ core, deps }, 1);
    const bothTick = core.match!.tick;
    core.leave('a2', false);
    const a3 = new FakeLink('a3'); core.join(a3, { rejoinKey: key2 });
    tickOnce(core, deps);
    expect(core.match!.seats[1]!.connected).toBe(true);
    send(core, 'a3', 10, 'forfeit'); send(core, 'b', 10, 'forfeit');
    for (let i = 0; i < 100 && core.match!.result === null; i++) tickOnce(core, deps);
    expect(core.match!.result).not.toBeNull();

    const ticksLogged = core.log.map(e => e.tick);
    expect(new Set(ticksLogged).size).toBe(ticksLogged.length);
    const at = (tick: number) => core.log.find(e => e.tick === tick)?.inputs;
    expect(at(leaveTick)).toEqual([{ seat: 1, seq: 0, cmd: { type: 'disconnect' } }]);
    expect(at(rejoinTick)).toEqual([{ seat: 1, seq: 0, cmd: { type: 'reconnect' } }]);
    expect(at(bothTick)).toEqual([{ seat: 1, seq: 0, cmd: { type: 'disconnect' } }, { seat: 1, seq: 0, cmd: { type: 'reconnect' } }]);
    expect(replayMatch(data, 7, [1, 2], core.log).at(-1)).toEqual([core.match!.tick, matchHash(core.match!)]);
  });

  test('second use of a key: new key works, old key refused; old tab told and its inputs ignored', () => {
    const { core, deps, links: [a] } = started(['가']);
    const key = a!.last('full').me.key;
    const b = new FakeLink('b'); core.join(b, { rejoinKey: key });
    expect(a!.last('notice')).toEqual({ kind: 'replaced' }); expect(a!.closed).toBe(4001);
    send(core, 'a', 1, 'summon'); tickOnce(core, deps);
    expect(core.match!.lanes[1]!.tokens).toBe(4);
    // the new tab has its snapshot and says so; only then is the old key gone (final review 1)
    core.message('b', 'keySaved', {});
    expect(() => core.join(new FakeLink('c'), { rejoinKey: key })).toThrow();
    const newKey = b.last('full').me.key;
    expect(() => core.join(new FakeLink('d'), { rejoinKey: newKey })).not.toThrow();
  });

  test('a link that drops before it answers its snapshot leaves the old key working (final review 1)', () => {
    const { core, deps, links: [a] } = started(['가', '나']);
    const key = a!.last('full').me.key;
    // dropped before the snapshot went out
    const a2 = new FakeLink('a2'); core.join(a2, { rejoinKey: key });
    core.leave('a2', false);
    const a3 = new FakeLink('a3');
    expect(() => core.join(a3, { rejoinKey: key })).not.toThrow();
    // a message before its snapshot does not retire the old key
    core.message('a3', 'keySaved', {});
    tickOnce(core, deps);
    expect(a3.last('full').me).toMatchObject({ seat: 1 });
    // got the snapshot, said nothing, dropped: the tab may not have stored the new key, so the old one still works
    core.leave('a3', false);
    const a4 = new FakeLink('a4');
    expect(() => core.join(a4, { rejoinKey: key })).not.toThrow();
    tickOnce(core, deps);
    expect(core.match!.seats[1]!.connected).toBe(true);
    const fresh = a4.last('full').me.key;
    expect(fresh).not.toBe(key);
    core.message('a4', 'keySaved', {});
    expect(() => core.join(new FakeLink('x'), { rejoinKey: key })).toThrow('badKey');
    const a5 = new FakeLink('a5');
    expect(() => core.join(a5, { rejoinKey: fresh })).not.toThrow();
    expect(a4.closed).toBe(4001);
  });

  test('in the result hold a rejoin that drops before answering keeps the old key too (final review 1)', () => {
    const { core, deps, links: [a] } = started(['가']);
    const key = a!.last('full').me.key;
    send(core, 'a', 1, 'forfeit'); tickOnce(core, deps);
    expect(core.phase).toBe('result');
    const a2 = new FakeLink('a2'); core.join(a2, { rejoinKey: key });
    expect(a2.last('full').me.key).not.toBe(key);
    core.leave('a2', false);
    expect(() => core.join(new FakeLink('a3'), { rejoinKey: key })).not.toThrow();
  });

  test('a nickname alone cannot take a seat back', () => {
    const { core } = started(['가']);
    expect(() => core.join(new FakeLink('x'), { name: '가' })).toThrow('alreadyStarted');
    expect(() => core.join(new FakeLink('y'), { name: '가', rejoinKey: 'nope' })).toThrow('badKey');
  });

  test('a rejoin full comes after the inputs already received for that tick', () => {
    const { core, deps, links: [a] } = started(['가']);
    const key = a!.last('full').me.key;
    send(core, 'a', 1, 'summon');
    const b = new FakeLink('b'); core.join(b, { rejoinKey: key });
    expect(b.all('full').length).toBe(0);
    tickOnce(core, deps);
    expect(b.all('full').length).toBe(1);
    expect(b.last('full').mine).toMatchObject({ tokens: 3, lastSeq: 1 });
    expect(core.match!.seats[1]!.connected).toBe(true);
  });

  test('a spirit refresh keeps the same spirit and its support token', () => {
    const r = started(['가', '나']);
    const { core, deps, links: [, b] } = r;
    const key = b!.last('full').me.key;
    send(core, 'b', 1, 'forfeit'); tickOnce(core, deps);
    expect(core.match!.seats[2]!.alive).toBe(false);
    while (core.match!.round < 1) tickOnce(core, deps);
    expect(core.match!.seats[2]!.supportTokens).toBe(1);
    core.leave('b', false); tickOnce(core, deps);
    const b2 = new FakeLink('b2'); core.join(b2, { rejoinKey: key }); tickOnce(core, deps);
    expect(b2.last('full').mine.supportTokens).toBe(1);
    expect(b2.last('full').me.seat).toBe(2);
    expect(core.match!.seats[2]!.alive).toBe(false);
  });

  test('everyone disconnected: the match runs to the end', () => {
    const r = started(['가', '나'], { dev: true }, { devJumpTick: 16500 });
    const { core, deps } = r;
    core.leave('a', false); core.leave('b', true);
    for (let i = 0; i < 2000 && core.phase === 'playing'; i++) tickOnce(core, deps);
    expect(core.phase).toBe('result');
    expect(core.match!.result!.outcome).toBe('wipe');
    expect(core.match!.result!.seats.map(s => s.outcome)).toEqual(['unfinished', 'unfinished']);
  });

  test('same result for all, one rematch room for simultaneous presses, first presser hosts, room closes after 120 s', async () => {
    const r = started(['가', '나']);
    const { core, deps, links: [a, b] } = r;
    const key = a!.last('full').me.key;
    send(core, 'a', 1, 'forfeit'); send(core, 'b', 1, 'forfeit'); tickOnce(core, deps);
    expect(core.phase).toBe('result');
    expect(a!.last('result')).toEqual(b!.last('result'));
    deps.clock.t += 10_000;
    core.message('b', 'rematch', {}); core.message('a', 'rematch', {});
    await settle();
    expect(deps.createRematchRoom).toHaveBeenCalledTimes(1);
    // the new lobby stays open, even empty, for the rest of this room's result hold (final review 2)
    expect(deps.createRematchRoom).toHaveBeenCalledWith({ hostToken: expect.any(String), keepOpenMs: 110_000 });
    expect(b!.all('notice')).toContainEqual({ kind: 'rematch', roomId: 'room-2', hostToken: expect.any(String) });
    expect(b!.last('notice')).toEqual({ kind: 'rematchReady', seats: [2, 1] });
    expect(a!.last('notice')).toEqual({ kind: 'rematch', roomId: 'room-2' });
    core.message('a', 'rematch', {}); await settle();
    expect(deps.createRematchRoom).toHaveBeenCalledTimes(1);
    expect(a!.last('notice')).toEqual({ kind: 'rematch', roomId: 'room-2' });

    const a2 = new FakeLink('a2'); core.join(a2, { rejoinKey: key });
    expect(a2.last('full')).toMatchObject({ me: { seat: 1 }, result: a!.last('result').result });
    expect(a!.closed).toBe(4001);

    deps.clock.t += 110_000 - 1; core.advance();
    expect(deps.disposed).toBe(false);
    deps.clock.t += 1; core.advance();
    expect(deps.disposed).toBe(true); expect(core.phase).toBe('closed');
    expect(() => core.join(new FakeLink('z'), { rejoinKey: a2.last('full').me.key })).toThrow('badKey');
  });

  test('rematch is refused before the result', async () => {
    const { core, deps, links: [a] } = started(['가']);
    core.message('a', 'rematch', {}); await settle();
    expect(deps.createRematchRoom).not.toHaveBeenCalled();
    expect(a!.last('notice')).toBeUndefined();
  });
});

test('recordings pin rules and keep a detached input log', () => {
  const { core, deps } = started(['가'], {}, { stage: 'stage3' });
  send(core, 'a', 1, 'forfeit');
  tickOnce(core, deps);
  const record = core.recording();
  expect(record).toMatchObject({ rulesRevision: expect.stringMatching(/^[a-f0-9]{40}$/),
    stage: 'stage3', dataVersion: core.match!.dataVersion, seats: [1], log: core.log });
  expect(record.log).not.toBe(core.log);
});

test('a swap confirmed before a rejoin comes back with its place, cost and held jige, and is not confirmed again', () => {
  const d3 = loadGameData('stage3');
  const r = started(['가', '나'], { dev: true }, { stage: 'stage3', devJumpTick: roundStartTick(d3, 3) + 1 });
  tickOnce(r.core, r.deps);
  const lane = r.core.match!.lanes[1]!;
  const unit = placeUnitForTest(lane, 'meok', 2);
  unit.cost = 8;
  lane.econ!.jige = 2;
  const result = d3.units.find(u => !u.hidden && u.grade === d3.units.find(x => x.id === 'meok')!.grade && u.id !== 'meok')!.id;
  send(r.core, 'a', 1, 'jigeSwap', { source: { zone: 'board', index: 2, unitId: unit.id }, result });
  tickOnce(r.core, r.deps);
  expect(r.links[0]!.last('mine').acks).toEqual([expect.objectContaining({ seq: 1, ok: true })]);
  const key = r.links[0]!.last('full').me.key;
  r.core.leave('a', false); tickOnce(r.core, r.deps);
  const a2 = new FakeLink('a2'); r.core.join(a2, { rejoinKey: key }); tickOnce(r.core, r.deps);
  const full = a2.last('full');
  expect(full.mine.units[2]).toMatchObject({ defId: result, cost: 8 });
  expect(full.mine.econ.jige).toBe(1);
  expect(full.mine.acks).toEqual([]);
  expect(full.mine.lastSeq).toBe(1);
  expect(a2.all('mine').flatMap((m: { acks: unknown[] }) => m.acks)).toEqual([]);
});
