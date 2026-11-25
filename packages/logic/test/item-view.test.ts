import { describe, expect, test } from 'vitest';
import {
  applyFull, applyLane, applyMine, applyTick, buildFull, buildTick, createMatch, diffViews, loadGameData, MatchStreamer, shopItem,
  stepMatch, type ClientView, type MatchInput, type MatchState,
} from '../src/index';
import { placeUnitForTest, withoutMarketLock } from '../src/testing';

const d3 = withoutMarketLock(loadGameData('stage3'));
const names = { 1: '하나', 2: '둘' };
const opts = (watching: number, n: number) => ({ watching, names, key: 'k', n });

function match(): MatchState {
  return createMatch(d3, 5, [1, 2]);
}

describe('item commands in a match', () => {
  test('an attachItem for a unit that left its slot is staleUnit and changes nothing', () => {
    const m = match();
    const lane = m.lanes[1]!;
    const old = placeUnitForTest(lane, 'jipsin', 0);
    lane.coins = shopItem(d3, 'powerCharm')!.coins + 100;
    const r1 = stepMatch(m, [
      { seat: 1, seq: 1, cmd: { type: 'buyItem', item: 'powerCharm' } },
      { seat: 1, seq: 2, cmd: { type: 'sell', slot: 0, unitId: old.id } },
    ]);
    expect(r1.acks.map(a => a.ok)).toEqual([true, true]);
    const fresh = placeUnitForTest(lane, 'dunggumi', 0);
    const r2 = stepMatch(m, [{ seat: 1, seq: 3, cmd: { type: 'attachItem', item: 'powerCharm', slot: 0, unitId: old.id } }]);
    expect(r2.acks[0]).toMatchObject({ ok: false, reason: 'staleUnit' });
    expect(lane.econ!.items!.powerCharm).toBe(1);
    expect(lane.slots[0]).toBe(fresh);
    expect(fresh.item).toBeUndefined();
    const r3 = stepMatch(m, [{ seat: 1, seq: 4, cmd: { type: 'attachItem', item: 'powerCharm', slot: 0, unitId: fresh.id } }]);
    expect(r3.acks[0]).toMatchObject({ ok: true });
    expect(fresh.item).toBe('powerCharm');
  });
});

describe('items in the streamed views', () => {
  test('a watcher sees an item swapped on a unit that never moved, and a new full agrees', () => {
    const m = match();
    const lane = m.lanes[1]!;
    const unit = placeUnitForTest(lane, 'jipsin', 3);
    placeUnitForTest(lane, 'dunggumi', 4);
    lane.coins = shopItem(d3, 'powerCharm')!.coins + shopItem(d3, 'swiftCharm')!.coins;
    const streamer = new MatchStreamer(m);
    let n = 0;
    const owner: ClientView = applyFull(buildFull(m, 1, opts(1, n)));
    const watcher: ClientView = applyFull(buildFull(m, 2, opts(1, n)));
    expect(owner.mine.units[3]).toEqual({ id: unit.id, defId: 'jipsin', cost: unit.cost });
    expect('item' in watcher.lane.units[3]!).toBe(false);

    let seq = 0;
    const play = (cmds: MatchInput['cmd'][]) => {
      const r = stepMatch(m, cmds.map(cmd => ({ seat: 1, seq: ++seq, cmd })));
      expect(r.acks.every(a => a.ok)).toBe(true);
      const out = streamer.afterStep(r);
      n++;
      const tick = buildTick(m, names, n);
      for (const v of [owner, watcher]) expect(applyTick(v, tick)).toBe('ok');
      const lanes = { n, seat: 1, batches: [{ tick: r.tick, events: out.lanes[1]! }] };
      for (const v of [owner, watcher]) expect(applyLane(v, lanes)).toBe('ok');
      if (out.mine[1]) applyMine(owner, out.mine[1]);
      if (out.mine[2]) applyMine(watcher, out.mine[2]);
      return out;
    };

    const first = play([{ type: 'buyItem', item: 'powerCharm' }, { type: 'attachItem', item: 'powerCharm', slot: 3, unitId: unit.id }]);
    expect(first.lanes[1]!.some(e => e.t === 'board')).toBe(true);
    expect(watcher.lane.units[3]).toEqual({ id: unit.id, defId: 'jipsin', item: 'powerCharm' });
    expect(owner.mine.units[3]!.item).toBe('powerCharm');
    expect('item' in watcher.lane.units[4]!).toBe(false);

    play([{ type: 'buyItem', item: 'swiftCharm' }, { type: 'attachItem', item: 'swiftCharm', slot: 3, unitId: unit.id }]);
    expect(watcher.lane.units[3]!.item).toBe('swiftCharm');
    expect(owner.mine.units[3]!.item).toBe('swiftCharm');

    const rejoinOwner = buildFull(m, 1, opts(1, n));
    const rejoinWatcher = buildFull(m, 2, opts(1, n));
    expect(rejoinOwner.mine.units[3]!.item).toBe('swiftCharm');
    expect(rejoinWatcher.lane.units[3]!.item).toBe('swiftCharm');
    expect(diffViews(owner, rejoinOwner)).toEqual([]);
    expect(diffViews(watcher, rejoinWatcher)).toEqual([]);
  });

  test('the item notes reach the owner through the lane stream', () => {
    const m = match();
    const lane = m.lanes[1]!;
    const unit = placeUnitForTest(lane, 'jipsin', 3);
    lane.coins = shopItem(d3, 'weakCharm')!.coins;
    const streamer = new MatchStreamer(m);
    const r = stepMatch(m, [
      { seat: 1, seq: 1, cmd: { type: 'buyItem', item: 'weakCharm' } },
      { seat: 1, seq: 2, cmd: { type: 'attachItem', item: 'weakCharm', slot: 3, unitId: unit.id } },
    ]);
    const notes = streamer.afterStep(r).lanes[1]!.filter(e => e.t === 'note');
    expect(notes).toEqual([
      { t: 'note', ev: { type: 'itemBought', item: 'weakCharm' } },
      { t: 'note', ev: { type: 'itemAttached', item: 'weakCharm', unitId: unit.id, defId: 'jipsin', replaced: null } },
    ]);
  });

  test('stored units carry their item to the owner', () => {
    const m = match();
    const lane = m.lanes[1]!;
    const unit = placeUnitForTest(lane, 'jipsin', 3);
    unit.item = 'powerCharm';
    stepMatch(m, [{ seat: 1, seq: 1, cmd: { type: 'store', slot: 3, unitId: unit.id } }]);
    expect(buildFull(m, 1, opts(1, 0)).mine.storage).toEqual([{ id: unit.id, defId: 'jipsin', cost: unit.cost, item: 'powerCharm' }]);
  });

  test('boards without items keep their view shape', () => {
    const m = createMatch(loadGameData('stage2'), 5, [1, 2]);
    const u = placeUnitForTest(m.lanes[1]!, 'sotlid', 0);
    const full = buildFull(m, 2, opts(1, 0));
    expect(full.lane.units[0]).toEqual({ id: u.id, defId: 'sotlid' });
    expect(Object.keys(buildFull(m, 1, opts(1, 0)).mine.units[0]!)).toEqual(['id', 'defId']);
  });
});
