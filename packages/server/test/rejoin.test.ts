import { describe, expect, test } from 'vitest';
import { loadGameData, roundStartTick } from '@dorandi/logic';
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

  test('second use of a key: new key works, old key refused; old tab told and its inputs ignored', () => {
    const { core, deps, links: [a] } = started(['가']);
    const key = a!.last('full').me.key;
    const b = new FakeLink('b'); core.join(b, { rejoinKey: key });
    expect(a!.last('notice')).toEqual({ kind: 'replaced' }); expect(a!.closed).toBe(4001);
    send(core, 'a', 1, 'summon'); tickOnce(core, deps);
    expect(core.match!.lanes[1]!.tokens).toBe(4);
    expect(() => core.join(new FakeLink('c'), { rejoinKey: key })).toThrow();
    const newKey = b.last('full').me.key;
    expect(() => core.join(new FakeLink('d'), { rejoinKey: newKey })).not.toThrow();
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
    core.message('b', 'rematch', {}); core.message('a', 'rematch', {});
    await settle();
    expect(deps.createRematchRoom).toHaveBeenCalledTimes(1);
    expect(b!.last('notice')).toEqual({ kind: 'rematch', roomId: 'room-2', hostToken: expect.any(String) });
    expect(a!.last('notice')).toEqual({ kind: 'rematch', roomId: 'room-2' });
    core.message('a', 'rematch', {}); await settle();
    expect(deps.createRematchRoom).toHaveBeenCalledTimes(1);
    expect(a!.last('notice')).toEqual({ kind: 'rematch', roomId: 'room-2' });

    const a2 = new FakeLink('a2'); core.join(a2, { rejoinKey: key });
    expect(a2.last('full')).toMatchObject({ me: { seat: 1 }, result: a!.last('result').result });
    expect(a!.closed).toBe(4001);

    deps.clock.t += 120_000 - 1; core.advance();
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
