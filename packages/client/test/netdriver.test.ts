import { describe, expect, test } from 'vitest';
import { buildFull, createMatch, enemyDistanceAt, loadGameData, type FullMsg, type GameEvent, type TickMsg } from '@dorandi/logic';
import { placeUnitForTest, stepMatchUntil } from '@dorandi/logic/testing';

const store = new Map<string, string>();
(globalThis as { sessionStorage?: unknown }).sessionStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => { store.clear(); },
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
};

import { NetClient } from '../src/net/NetClient';
import { NetDriver, renderTickAt } from '../src/net/NetDriver';
import { viewToGameState } from '../src/net/viewState';
import type { RoomLike } from '../src/net/room';

class FakeRoom implements RoomLike {
  roomId = 'room-1';
  sent: { type: string; msg?: any }[] = [];
  private handlers = new Map<string, ((msg: any) => void)[]>();
  send(type: string, msg?: unknown): void { this.sent.push({ type, msg }); }
  onMessage(type: string, cb: (msg: any) => void): void {
    const list = this.handlers.get(type) ?? [];
    list.push(cb);
    this.handlers.set(type, list);
  }
  onLeave(): void {}
  async leave(): Promise<unknown> { return undefined; }
  emit(type: string, msg: unknown): void { for (const cb of this.handlers.get(type) ?? []) cb(msg); }
}

const data = loadGameData('stage2');

function fixtureView(): { view: FullMsg; data: typeof data } {
  const match = createMatch(data, 7, [1, 2]);
  placeUnitForTest(match.lanes[1]!, 'sotlid', 0);
  stepMatchUntil(match, 700);
  const view = buildFull(match, 1, { watching: 1, names: { 1: '하나', 2: 'two' }, key: 'k1', n: 0 });
  return { view, data };
}

function fixtureNet() {
  const { view } = fixtureView();
  const room = new FakeRoom();
  const net = new NetClient(room, view.dataVersion);
  room.emit('full', view);
  return { net, room, data, view };
}

function tickFrom(view: FullMsg): TickMsg {
  return { n: view.n + 1, clock: view.clock, rows: view.rows, gate: view.gate, yeoksin: view.yeoksin };
}

describe('NetDriver', () => {
  test('a birth notice reaches the scene, marked mine for the own seat', () => {
    const { net, room } = fixtureNet();
    const drv = new NetDriver(net, data);
    const got: [unknown, boolean][] = [];
    drv.onBirthNotice((alert, mine) => got.push([alert, mine]));
    const peer = { kind: 'birth', seat: 2, name: 'two', defId: 'bihyeongrang', unitId: 3, via: 'combine', firstSix: true };
    room.emit('notice', peer);
    room.emit('notice', { ...peer, seat: 1, name: '하나', firstSix: false });
    room.emit('notice', { kind: 'gamble', name: 'two', hit: '×10 당첨' });
    expect(got).toEqual([
      [{ seat: 2, name: 'two', defId: 'bihyeongrang', unitId: 3, via: 'combine', firstSix: true }, false],
      [{ seat: 1, name: '하나', defId: 'bihyeongrang', unitId: 3, via: 'combine', firstSix: false }, true],
    ]);
  });

  test('viewToGameState keeps the own book costs from mine, 0 included', () => {
    const { view, data } = fixtureView();
    const units = view.mine.units.map((u, i) => (u ? { ...u, cost: i } : null));
    const storage = [{ id: 900, defId: view.mine.units.find(Boolean)!.defId, cost: 0 }];
    const s = viewToGameState({ ...view, mine: { ...view.mine, units, storage } }, data, units, view.clock.tick, storage);
    const first = units.findIndex(Boolean);
    expect(s.slots[first]!.cost).toBe(first);
    expect(s.storage![0]!.cost).toBe(0);
    expect('cost' in viewToGameState(view, data, view.mine.units, view.clock.tick).slots[first]!).toBe(false);
  });

  test('viewToGameState exposes what LaneScene and the panels read', () => {
    const { view, data } = fixtureView();
    const s = viewToGameState(view, data, view.mine.units, view.clock.tick);
    expect(s).toMatchObject({ tick: view.clock.tick, round: 1, phase: 'round', tokens: view.mine.tokens, coins: view.mine.coins });
    expect(s.slots[0]).toMatchObject({ id: view.mine.units[0]!.id, defId: view.mine.units[0]!.defId });
    expect(view.lane.enemies.length).toBeGreaterThan(0);
    expect(s.enemies.map(e => e.id)).toEqual(view.lane.enemies.map(e => e.id));
    expect(s.enemies[0]!.d).toBeCloseTo(view.lane.enemies[0]!.d, 9);
  });
  test('viewToGameState counts the over-limit time of the watched lane, whose enemies it carries', () => {
    const { view, data } = fixtureView();
    const rows = view.rows.map(r => (r.seat === 1 ? { ...r, status: 'spirit' as const, overLimitTicks: 0 } : r.seat === 2 ? { ...r, overLimitTicks: 40 } : r));
    expect(viewToGameState({ ...view, rows, watching: 2 }, data, view.mine.units, view.clock.tick).overLimitTicks).toBe(40);
    const mine = view.rows.map(r => (r.seat === 1 ? { ...r, overLimitTicks: 7 } : r));
    expect(viewToGameState({ ...view, rows: mine }, data, view.mine.units, view.clock.tick).overLimitTicks).toBe(7);
  });
  test('an enemy moving below its own speed reads as slowed, a stopped one as stunned (drawn by the effect layer)', () => {
    const { view, data } = fixtureView();
    const e = view.lane.enemies[0]!;
    const base = data.enemies.find(d => d.id === e.defId)!.speed;
    const at = (speed: number) => viewToGameState({ ...view, lane: { ...view.lane, enemies: [{ ...e, speed }] } }, data, view.mine.units, view.clock.tick).enemies[0]!;
    expect(at(base).slow).toBeNull();
    expect(at(base * 0.7).slow!.pct).toBeCloseTo(0.3, 9);
    expect(at(0)).toMatchObject({ slow: null, stunTicks: 1 });
  });
  test('render tick lags 2 ticks, runs at most 100 ms past schedule, never goes back', () => {
    expect(renderTickAt(1000, 50, 1000, 0)).toBe(48);
    expect(renderTickAt(1050, 50, 1000, 48)).toBe(49);
    expect(renderTickAt(1300, 50, 1000, 49)).toBe(50);
    expect(renderTickAt(1300, 52, 1290, 50)).toBe(50.2);
    expect(renderTickAt(1000, 40, 1000, 50)).toBe(50);
  });
  test('a returning background tab applies 300 batches but animates only the last 10 ticks (review focus 1)', () => {
    const { net, room, data, view } = fixtureNet();
    const drv = new NetDriver(net, data);
    const animated: GameEvent[] = []; drv.onEvents(ev => animated.push(...ev));
    room.emit('tick', { ...tickFrom(view), n: view.n + 1, clock: { ...view.clock, tick: view.clock.tick + 300 } });
    room.emit('lane', { n: view.n + 1, seat: 1, batches: Array.from({ length: 300 }, (_, i) => ({ tick: view.clock.tick + 1 + i, events: [{ t: 'attack', unitId: 1, id: 1 }] })) });
    drv.update(16);
    expect(animated.filter(e => e.type === 'attack').length).toBe(10);
    expect(net.view!.lane.tick).toBe(view.clock.tick + 300);
  });
  test('a hidden tab fed tick+lane pairs one by one animates only the last 10 ticks on return (review checkpoint, finding 1)', () => {
    const { net, room, data, view } = fixtureNet();
    const drv = new NetDriver(net, data, () => 1000);
    const animated: GameEvent[] = []; drv.onEvents(ev => animated.push(...ev));
    const t0 = view.clock.tick;
    // the server sends one tick message and one lane message with 2 batches per 2 ticks; no frame runs meanwhile
    for (let k = 1; k <= 150; k++) {
      const tick = t0 + 2 * k;
      room.emit('tick', { ...tickFrom(view), n: view.n + k, clock: { ...view.clock, tick } });
      room.emit('lane', { n: view.n + k, seat: 1, batches: [tick - 1, tick].map(t => ({ tick: t, events: [{ t: 'attack', unitId: 1, id: 1 }] })) });
    }
    expect(animated.filter(e => e.type === 'attack')).toHaveLength(0);
    drv.update(16);
    const latest = t0 + 300;
    expect(net.view!.lane.tick).toBe(latest);
    expect(animated.filter(e => e.type === 'attack').length).toBeLessThanOrEqual(10);
    expect(animated.filter(e => e.type === 'attack').length).toBeGreaterThan(0);
    const enemies = net.view!.lane.enemies;
    expect(enemies.length).toBeGreaterThan(0);
    enemies.forEach((e, i) => expect(drv.state.enemies[i]!.d).toBeCloseTo(enemyDistanceAt(e, Math.max(latest - 2, e.t)), 9));
    drv.update(16);
    expect(animated.filter(e => e.type === 'attack').length).toBeLessThanOrEqual(10);
  });
  test('a full watching another lane moves laneSeat and laneEpoch (review checkpoint, finding 2)', () => {
    const match = createMatch(data, 7, [1, 2]);
    stepMatchUntil(match, 100);
    const room = new FakeRoom();
    const own = buildFull(match, 1, { watching: 1, names: { 1: '하나', 2: 'two' }, key: 'k1', n: 0 });
    const net = new NetClient(room, own.dataVersion);
    room.emit('full', own);
    const drv = new NetDriver(net, data);
    expect(drv.laneSeat).toBe(1);
    const epoch = drv.laneEpoch;
    room.emit('tick', tickFrom(own));
    expect(drv.laneEpoch).toBe(epoch);
    room.emit('full', buildFull(match, 1, { watching: 2, names: { 1: '하나', 2: 'two' }, key: 'k1', n: 2 }));
    expect(drv.laneSeat).toBe(2);
    expect(drv.laneEpoch).toBeGreaterThan(epoch);
  });

  test('a market receipt survives stale combat animation batches and is delivered once', () => {
    const { net, room, data, view } = fixtureNet();
    const drv = new NetDriver(net, data);
    const delivered: GameEvent[] = [];
    drv.onEvents(e => delivered.push(...e));
    const event = { type: 'gambleCoins', stake: 10, multiplier: 2, payout: 20 } as const;
    const tick = view.clock.tick + 1;
    room.emit('tick', { ...tickFrom(view), clock: { ...view.clock, tick: tick + 20 } });
    room.emit('lane', { n: view.n + 1, seat: 1, batches: [
      { tick, events: [{ t: 'attack', unitId: 1, id: 1 }, { t: 'note', ev: event }] },
    ] });
    drv.update(16);
    drv.update(16);
    expect(delivered).toEqual([event]);
  });
  test('queue(move) predicts at once and is read-only while watching another lane', () => {
    const { net, data } = fixtureNet();
    const drv = new NetDriver(net, data); drv.update(16);
    const id = drv.state.slots[0]!.id;
    drv.queue({ type: 'move', from: 0, to: 6 }); drv.update(16);
    expect(drv.state.slots[6]!.id).toBe(id);
    expect(drv.readOnly).toBe(false);
    net.view!.watching = 2; drv.update(16);
    expect(drv.readOnly).toBe(true);
  });
  test('a combine keeps its replaced unit id although mine arrives and a frame runs before the lane event (checkpoint 4)', () => {
    const { net, room, data, view } = fixtureNet();
    const drv = new NetDriver(net, data); drv.update(16);
    const oldId = drv.state.slots[0]!.id;
    const events: GameEvent[] = [];
    drv.onEvents(e => events.push(...e));
    drv.queue({ type: 'combine', result: 'gamasot', slot: 0 });
    const tick = view.clock.tick + 1;
    const newUnit = { id: oldId + 100, defId: 'gamasot' };
    room.emit('mine', { ...structuredClone(view.mine), tick, lastSeq: 1, acks: [{ seq: 1, ok: true }], units: [newUnit, ...view.mine.units.slice(1)] });
    drv.update(16);
    expect(drv.state.slots[0]!.id).toBe(newUnit.id);
    room.emit('lane', { n: view.n, seat: 1, batches: [{ tick, events: [{ t: 'combine', unitId: newUnit.id, defId: 'gamasot', slot: 0 }] }] });
    drv.update(16);
    expect(events.find(e => e.type === 'combine')).toMatchObject({ replacedUnitId: oldId, unitId: newUnit.id, slot: 0 });
  });
});
