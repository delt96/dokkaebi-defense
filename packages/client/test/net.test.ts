import { beforeEach, describe, expect, test } from 'vitest';
import { buildFull, createMatch, loadGameData, stepMatch, toWire, type Command, type FullMsg, type TickMsg, type UnitView } from '@dorandi/logic';
import { placeUnitForTest, withoutMarketLock } from '@dorandi/logic/testing';

const store = new Map<string, string>();
(globalThis as { sessionStorage?: unknown }).sessionStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => { store.clear(); },
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
};

import { NetClient, stage2DataVersion } from '../src/net/NetClient';
import type { RoomLike } from '../src/net/room';
import { clearSession, lastName, loadSession, saveSession } from '../src/net/session';
import { dimmedSlots, predictStorage, predictUnits, summonsLeft, type PendingCmd } from '../src/net/predict';

class FakeRoom implements RoomLike {
  roomId = 'room-1';
  sent: { type: string; msg?: any }[] = [];
  left: boolean | undefined;
  private handlers = new Map<string, ((msg: any) => void)[]>();
  private leaveHandlers: ((code: number) => void)[] = [];
  send(type: string, msg?: unknown): void { this.sent.push({ type, msg }); }
  onMessage(type: string, cb: (msg: any) => void): void {
    const list = this.handlers.get(type) ?? [];
    list.push(cb);
    this.handlers.set(type, list);
  }
  onLeave(cb: (code: number) => void): void { this.leaveHandlers.push(cb); }
  async leave(consented?: boolean): Promise<unknown> { this.left = consented; return undefined; }
  emit(type: string, msg: unknown): void { for (const cb of this.handlers.get(type) ?? []) cb(msg); }
  emitLeave(code: number): void { for (const cb of this.leaveHandlers) cb(code); }
}

const data = loadGameData('stage2');
const names = { 1: '하나', 2: 'two' };

function baseFull(): FullMsg {
  const match = createMatch(data, 7, [1, 2]);
  return buildFull(match, 1, { watching: 1, names, key: 'k1', n: 0 });
}

function connect(patch: (full: FullMsg) => void) {
  const room = new FakeRoom();
  const full = baseFull();
  patch(full);
  const net = new NetClient(room, full.dataVersion);
  room.emit('full', full);
  return { room, net, full };
}

const connected = () => connect(f => { f.mine.lastSeq = 4; f.mine.tokens = 2; });

function connectedWithUnit() {
  const unitA: UnitView = { id: 11, defId: 'sotlid' };
  const r = connect(f => { f.mine.lastSeq = 0; f.mine.units[0] = unitA; });
  return { ...r, unitA };
}

const connectedWithRecipe = () => connect(f => {
  f.mine.lastSeq = 0;
  f.mine.units[0] = { id: 11, defId: 'sotlid' };
  f.mine.units[1] = { id: 12, defId: 'bujigaengi' };
});

function tickOf(full: FullMsg): TickMsg {
  return { n: full.n + 1, clock: full.clock, rows: full.rows, gate: full.gate, yeoksin: full.yeoksin };
}

let current: FullMsg;
function mineAck(seq: number, result: { ok: true } | { ok: false; reason: string }) {
  const full = current;
  return { ...full.mine, tick: full.clock.tick + 1, lastSeq: seq, acks: [{ seat: 1, seq, tick: full.clock.tick + 1, ...result }] };
}

beforeEach(() => store.clear());

describe('NetClient', () => {
  test('seq continues from full.mine.lastSeq + 1; unacked commands are dropped on a new full', () => {
    const { room, net, full } = connected();
    net.send({ type: 'convertToken' });
    expect(room.sent.at(-1)).toEqual({ type: 'cmd', msg: { seq: 5, type: 'convertToken' } });
    room.emit('full', { ...full, mine: { ...full.mine, lastSeq: 9 } });
    expect(net.pending).toEqual([]);
    net.send({ type: 'convertToken' });
    expect(room.sent.at(-1)!.msg.seq).toBe(10);
  });
  test('a move is drawn at once and rolled back when rejected', () => {
    const { room, net, unitA, full } = connectedWithUnit();
    current = full;
    net.send({ type: 'move', from: 0, to: 6 });
    expect(room.sent.at(-1)).toEqual({ type: 'cmd', msg: { seq: 1, type: 'move', args: { from: 0, to: 6, unitId: 11, toUnitId: null } } });
    expect(net.units()[6]).toEqual(unitA); expect(net.units()[0]).toBeNull();
    const events: string[] = [];
    net.on(e => events.push(e.kind));
    room.emit('mine', mineAck(1, { ok: false, reason: 'staleUnit' }));
    expect(net.units()[0]).toEqual(unitA); expect(net.units()[6]).toBeNull();
    expect(events).toContain('rejected');
    expect(net.pending).toEqual([]);
  });
  test('rapid summons never exceed the server token count', () => {
    const { room, net } = connected();
    for (let i = 0; i < 5; i++) net.send({ type: 'summon' });
    expect(room.sent.filter(s => s.type === 'cmd').length).toBe(2);
  });
  test('combine twice before the ack sends once (review focus 3)', () => {
    const { room, net } = connectedWithRecipe();
    expect(net.send({ type: 'combine', result: 'gamasot', slot: 0 })).toBe(true);
    expect(net.send({ type: 'combine', result: 'gamasot', slot: 0 })).toBe(false);
    expect(room.sent.filter(s => s.type === 'cmd').length).toBe(1);
  });
  test('selling the same slot twice before the ack sends once', () => {
    const { room, net } = connectedWithRecipe();
    expect(net.send({ type: 'sell', slot: 1 })).toBe(true);
    expect(net.send({ type: 'sell', slot: 1 })).toBe(false);
    expect(room.sent.filter(s => s.type === 'cmd')).toHaveLength(1);
  });
  test('a gap in update numbers asks for resync', () => {
    const { room, full } = connected();
    room.emit('tick', { ...tickOf(full), n: full.n + 2 });
    expect(room.sent.at(-1)).toEqual({ type: 'resync', msg: {} });
  });
  test('the rejoin key is stored per room', () => {
    const { full } = connected();
    expect(loadSession('room-1')).toMatchObject({ key: full.me.key });
  });
  test('the first full tells the server the new key is stored, once per connection (final review 1)', () => {
    const { room, full } = connected();
    expect(room.sent).toEqual([{ type: 'keySaved', msg: {} }]);
    room.emit('full', full);
    expect(room.sent.filter(s => s.type === 'keySaved')).toHaveLength(1);
    const other = new FakeRoom();
    new NetClient(other, 'other-version');
    other.emit('full', baseFull());
    expect(other.sent).toEqual([{ type: 'keySaved', msg: {} }]);
  });
  test('a resync full built before a sent command arrived does not reuse its seq', () => {
    const { room, net, full } = connected();
    net.send({ type: 'convertToken' });
    room.emit('full', full);
    net.send({ type: 'convertToken' });
    expect(room.sent.filter(s => s.type === 'cmd').map(s => s.msg.seq)).toEqual([5, 6]);
  });
  test('the local data version matches the server match', () => {
    expect(stage2DataVersion()).toBe(baseFull().dataVersion);
  });
  test('a full with another data version reports versionMismatch', () => {
    const room = new FakeRoom();
    const net = new NetClient(room, 'other-version');
    const kinds: string[] = [];
    net.on(e => kinds.push(e.kind));
    room.emit('full', baseFull());
    expect(kinds).toEqual(['versionMismatch']);
    expect(net.view).toBeNull();
    // a reload after the version notice must still find its seat (review checkpoint, finding 3)
    expect(loadSession('room-1')?.key).toBe(baseFull().me.key);
  });
  test('a spirit can only send support and forfeit', () => {
    const { room, net } = connect(f => { f.rows[0]!.status = 'spirit'; });
    expect(net.send({ type: 'summon' })).toBe(false);
    expect(net.send({ type: 'support', target: 2 })).toBe(true);
    expect(room.sent.at(-1)).toEqual({ type: 'cmd', msg: { seq: 1, type: 'support', args: { target: 2 } } });
  });
  test('room messages carry objects', () => {
    const { room, net } = connected();
    net.ready(true); net.start(); net.watch(2); net.rematch();
    expect(room.sent.slice(-4)).toEqual([
      { type: 'ready', msg: { ready: true } }, { type: 'start', msg: {} }, { type: 'watch', msg: { seat: 2 } }, { type: 'rematch', msg: {} },
    ]);
  });
  test('applied lane batches are passed on; result and leave are reported', () => {
    const { room, net, full } = connected();
    const got: unknown[] = [];
    net.on(e => got.push(e));
    room.emit('tick', tickOf(full));
    const batches = [{ tick: full.lane.tick, events: [] }, { tick: full.lane.tick + 1, events: [] }];
    room.emit('lane', { n: full.n + 1, seat: 1, batches });
    expect(got).toContainEqual({ kind: 'lane', batches: [batches[1]] });
    room.emit('result', { result: { outcome: 'wipe' } });
    expect(net.view!.result).toEqual({ outcome: 'wipe' });
    room.emitLeave(4002);
    expect(got.at(-1)).toEqual({ kind: 'left', code: 4002 });
  });
});

describe('item commands on the wire', () => {
  test('attachItem carries the unit drawn at the slot, after a pending move too', () => {
    const { room, net } = connectedWithUnit();
    expect(net.send({ type: 'buyItem', item: 'powerCharm' })).toBe(true);
    expect(room.sent.at(-1)).toEqual({ type: 'cmd', msg: { seq: 1, type: 'buyItem', args: { item: 'powerCharm' } } });
    net.send({ type: 'attachItem', item: 'powerCharm', slot: 0 });
    expect(room.sent.at(-1)).toEqual({ type: 'cmd', msg: { seq: 2, type: 'attachItem', args: { item: 'powerCharm', slot: 0, unitId: 11 } } });
    net.send({ type: 'move', from: 0, to: 6 });
    net.send({ type: 'attachItem', item: 'swiftCharm', slot: 6 });
    expect(room.sent.at(-1)!.msg).toEqual({ seq: 4, type: 'attachItem', args: { item: 'swiftCharm', slot: 6, unitId: 11 } });
  });
});

describe('predict', () => {
  test('predictStorage matches the server', () => {
    const d3 = withoutMarketLock(loadGameData('stage3'));
    const match = createMatch(d3, 2, [1, 2]);
    const lane = match.lanes[1]!;
    const kinds: [string, string | null][] = [['jipsin', 'powerCharm'], ['jipsin', null], ['jipsin', 'swiftCharm'], ['dunggumi', 'weakCharm'], ['dunggumi', null]];
    kinds.forEach(([defId, item], i) => { const u = placeUnitForTest(lane, defId, i); if (item) u.item = item; });
    stepMatch(match, [{ seat: 1, seq: 1, cmd: { type: 'storeAll' } }]);
    const full = buildFull(match, 1, { watching: 1, names, key: 'k', n: 0 });
    expect(full.mine.storage!.filter(u => u.item)).toHaveLength(3);
    const cmds: Command[] = [{ type: 'retrieve', defId: 'jipsin' }, { type: 'sellStored', defId: 'jipsin' }, { type: 'sellStored', defId: 'dunggumi' }];
    const pending: PendingCmd[] = cmds.map((cmd, i) => ({ seq: i + 2, ...toWire(cmd) }));
    const predicted = predictStorage(full.mine.storage, pending)!.map(u => u.id);
    const r = stepMatch(match, cmds.map((cmd, i) => ({ seat: 1, seq: i + 2, cmd })));
    expect(r.acks.every(a => a.ok)).toBe(true);
    expect(predicted).toEqual(lane.storage!.map(u => u.id));
    expect(lane.storage!.every(u => u.item)).toBe(true);
  });

  const a: UnitView = { id: 1, defId: 'x' };
  const b: UnitView = { id: 2, defId: 'y' };
  const open = [true, true, false];
  const mv = (seq: number, from: number, to: number, unitId: number, toUnitId: number | null = null): PendingCmd =>
    ({ seq, type: 'move', args: { from, to, unitId, toUnitId } });
  test('moves apply in order, swap with an occupied target, and skip stale or closed ones', () => {
    expect(predictUnits([a, b, null], open, [mv(1, 0, 1, 1, 2)])).toEqual([b, a, null]);
    expect(predictUnits([a, b, null], open, [mv(1, 0, 1, 1, null)])).toEqual([a, b, null]);
    expect(predictUnits([a, null, null], open, [mv(1, 0, 2, 1)])).toEqual([a, null, null]);
    expect(predictUnits([a, null, null], open, [mv(1, 0, 1, 9)])).toEqual([a, null, null]);
    expect(predictUnits([null, a, null], open, [mv(1, 0, 1, 1)])).toEqual([null, a, null]);
    expect(predictUnits([a, null, null], open, [mv(1, 0, 1, 1), mv(2, 1, 0, 1)])).toEqual([a, null, null]);
  });
  test('summonsLeft and dimmedSlots', () => {
    const pending: PendingCmd[] = [{ seq: 1, type: 'summon' }, { seq: 2, type: 'combine', args: { result: 'r', slot: 3, unitId: 1 } }, { seq: 3, type: 'sell', args: { slot: 5, unitId: 2 } }];
    expect(summonsLeft(3, pending)).toBe(2);
    expect(summonsLeft(1, [...pending, { seq: 4, type: 'summon' }])).toBe(0);
    expect([...dimmedSlots(pending)].sort()).toEqual([3, 5]);
  });
});

describe('session', () => {
  test('save, load, clear and last name', () => {
    expect(loadSession('r')).toBeNull();
    expect(lastName()).toBeNull();
    saveSession('r', { key: 'abc', name: '도깨비' });
    expect(loadSession('r')).toEqual({ key: 'abc', name: '도깨비' });
    expect(lastName()).toBe('도깨비');
    expect(store.has('dorandi:room:r')).toBe(true);
    clearSession('r');
    expect(loadSession('r')).toBeNull();
    expect(lastName()).toBe('도깨비');
  });
});
