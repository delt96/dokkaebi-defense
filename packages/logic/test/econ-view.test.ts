import { describe, expect, test } from 'vitest';
import {
  applyFull, applyLane, applyMine, applyTick, buildFull, buildTick, buyCheck, createGame, createMatch, diffViews, econView, loadGameData,
  MatchStreamer, roundStartTick, step, stepMatch, type LaneBatch, type MatchCommand, type MatchState,
} from '../src/index';
import { forceRound, jumpToTick, placeUnitForTest, spawnEnemyForTest } from '../src/testing';

const d2 = loadGameData('stage2');
const d3 = loadGameData('stage3');
const names = { 1: '가', 2: '나' };

describe('econView', () => {
  test('null without an economy; stage 2 mine and full carry no econ key', () => {
    expect(econView(createGame(d2, 1))).toBeNull();
    const m = createMatch(d2, 1, [1, 2]);
    stepMatch(m, []);
    expect('econ' in buildFull(m, 1, { watching: 1, names, key: 'k', n: 0 }).mine).toBe(false);
  });

  test('market part: closed in prep, then the reasons follow the purchase order and the deck counts', () => {
    const s = createGame(d3, 1);
    expect(econView(s)!.market!.why).toEqual({ draw: 'marketClosed' });
    forceRound(s, 1);
    s.coins = 40;
    let v = econView(s)!.market!;
    expect(v.why).toEqual({ draw: null });
    expect(v.draw).toMatchObject({ buckwheatCost: 1, left: 3, weights: [2, 1] });
    s.coins = 1000;
    for (let i = 0; i < s.slots.length; i++) if (s.open[i]) placeUnitForTest(s, 'jipsin', i);
    expect(buyCheck(s, 'draw')).toBe('noSlot');
    expect(econView(s)!.market!.why.draw).toBe('noSlot');
    s.slots[0] = null;
    step(s, [{ type: 'buy', item: 'draw' }]);
    v = econView(s)!.market!;
    expect(v.draw.left).toBe(d3.economy!.market!.draw.perDay - 1);
  });

  test('tame part lists living targets with odds, wait, leave tick and tameCheck reason', () => {
    const s = createGame(d3, 1);
    forceRound(s, 20);
    const boss = spawnEnemyForTest(s, 'gangcheori', 1, 1000);
    boss.maxHp = 10000;
    s.buckwheat = 2; s.coins = 75;
    let t = econView(s)!.tame;
    expect(t).toEqual([{
      enemyId: boss.id, defId: 'gangcheori', unit: 'gangcheori', cost: { buckwheat: 2, coins: 75 }, needs: 'slowed',
      chance: 0.7, readyTick: 0, deadlineTick: s.roundEndTick, why: 'tameCondition',
    }]);
    boss.slow = { pct: 0.3, ticks: 10 };
    expect(econView(s)!.tame[0]!.why).toBeNull();
    boss.hp = 1501;
    expect(econView(s)!.tame[0]!.chance).toBe(0.5);
    s.econ!.tameReady = [{ enemyId: boss.id, tick: s.tick + 5 }];
    expect(econView(s)!.tame[0]).toMatchObject({ readyTick: s.tick + 5, why: 'cooldown' });
    boss.hp = 0;
    t = econView(s)!.tame;
    expect(t).toEqual([]);
  });
});

describe('econ in the mine stream', () => {
  const rst = (r: number) => roundStartTick(d3, r);
  function start(): { m: MatchState; streamer: MatchStreamer } {
    const m = createMatch(d3, 3, [1, 2]);
    jumpToTick(m, rst(2) + 1);
    return { m, streamer: new MatchStreamer(m) };
  }

  test('a buy reaches its seat through mine, and full agrees with the stream', () => {
    const { m, streamer } = start();
    const view = buildFull(m, 1, { watching: 1, names, key: 'k', n: 0 });
    const r = stepMatch(m, [{ seat: 1, seq: 1, cmd: { type: 'buy', item: 'draw' } }]);
    const out = streamer.afterStep(r);
    expect(out.mine[1]!.econ!.market!.draw.left).toBe(2);
    expect(out.mine[2]).toBeNull();
    applyMine(view, out.mine[1]!);
    expect(view.mine.econ).toEqual(buildFull(m, 1, { watching: 1, names, key: 'k', n: 0 }).mine.econ);
    expect('transfer' in view.mine.econ!).toBe(false);
  });
});

describe('market and swap results in mine', () => {
  const opts = (seat: number) => ({ watching: seat, names, key: 'k', n: 0 });

  test('full after two accepted swaps equals streamed mine', () => {
    const m = createMatch(d3, 4, [1, 2]);
    jumpToTick(m, roundStartTick(d3, 3) + 1);
    const streamer = new MatchStreamer(m);
    const view = buildFull(m, 1, opts(1));
    const lane = m.lanes[1]!;
    const board = placeUnitForTest(lane, 'meok', 2);
    board.cost = 8;
    const stored = placeUnitForTest(lane, 'jipsin', 1);
    stored.cost = 0;
    lane.econ!.jige = 2;
    lane.buckwheat = 2;
    const other = structuredClone(buildFull(m, 2, opts(2)).mine);
    let seq = 0;
    const run = (cmds: MatchCommand[]) => {
      const out = streamer.afterStep(stepMatch(m, cmds.map(cmd => ({ seat: 1, seq: ++seq, cmd }))));
      if (out.mine[1]) applyMine(view, out.mine[1]);
      return out;
    };
    run([{ type: 'store', slot: 1, unitId: stored.id }, { type: 'buy', item: 'draw' }]);
    const peer = (id: string) => d3.units.find(u => !u.hidden && u.grade === d3.units.find(x => x.id === id)!.grade && u.id !== id)!.id;
    const swapBoard: MatchCommand = { type: 'jigeSwap', source: { zone: 'board', index: 2, unitId: board.id }, result: peer('meok') };
    let out = run([swapBoard]);
    expect(out.mine[1]!.acks.map(a => a.ok)).toEqual([true]);
    const swapStored: MatchCommand = { type: 'jigeSwap', source: { zone: 'storage', index: 0, unitId: stored.id }, result: peer('jipsin') };
    out = run([swapStored]);
    expect(out.mine[1]!.acks.map(a => a.ok)).toEqual([true]);
    // the same confirm again (a fresh seq, the old unit id) is stale
    out = run([swapBoard]);
    expect(out.mine[1]!.acks).toEqual([expect.objectContaining({ ok: false, reason: 'staleUnit' })]);
    const fresh = buildFull(m, 1, opts(1));
    expect(diffViews(view, fresh).filter(p => !/^(clock|lane)./.test(p))).toEqual([]);
    expect(fresh.mine.econ!.jige).toBe(0);
    expect(fresh.mine.econ!.market!.draw.left).toBe(2);
    expect(fresh.mine.units[2]).toMatchObject({ defId: peer('meok'), cost: 8 });
    expect(fresh.mine.storage![0]).toMatchObject({ defId: peer('jipsin'), cost: 0 });
    expect(fresh.mine.lastSeq).toBe(seq);
    expect({ ...buildFull(m, 2, opts(2)).mine, tick: 0 }).toEqual({ ...other, tick: 0 });
    // board broadcasts carry public identity only
    expect(fresh.lane.units[2]).toEqual({ id: fresh.mine.units[2]!.id, defId: peer('meok') });
  });

  test('stage 2 mine units carry no cost key', () => {
    const m = createMatch(d2, 1, [1, 2]);
    jumpToTick(m, roundStartTick(d2, 2) + 1);
    placeUnitForTest(m.lanes[1]!, 'ki', 0);
    const mine = buildFull(m, 1, opts(1)).mine;
    expect(Object.keys(mine.units.find(Boolean)!)).toEqual(['id', 'defId']);
  });

  test('economy bytes are bounded by inventory and quests', () => {
    const seats = [1, 2, 3, 4, 5, 6];
    const m = createMatch(d3, 9, seats);
    jumpToTick(m, roundStartTick(d3, 24) + 1);
    const normals = d3.units.filter(u => !u.hidden && u.grade <= 2);
    for (const s of seats) {
      const lane = m.lanes[s]!;
      lane.open.fill(true);
      for (let i = 0; i < lane.slots.length; i++) placeUnitForTest(lane, normals[i % normals.length]!.id, i).cost = 12345;
      lane.storage = Array.from({ length: 20 }, (_, i) => ({ ...lane.slots[0]!, id: 9000 + i, cost: 12345 }));
      lane.econ!.jige = 99;
    }
    const strip = (v: unknown) => JSON.parse(JSON.stringify(v, (k, x) => (k === 'econ' || k === 'cost' ? undefined : x)));
    const size = (v: unknown) => Buffer.byteLength(JSON.stringify(v), 'utf8');
    for (const s of seats) {
      const full = buildFull(m, s, opts(s));
      expect(size(full) - size(strip(full))).toBeLessThanOrEqual(4096);
      expect(JSON.stringify(full.lane)).not.toContain('cost');
    }
    const streamer = new MatchStreamer(m);
    streamer.afterStep(stepMatch(m, []));
    let mines = 0;
    for (let i = 0; i < 20; i++) {
      const out = streamer.afterStep(stepMatch(m, []));
      mines += Object.values(out.mine).filter(Boolean).length;
      for (const batch of Object.values(out.lanes)) expect(JSON.stringify(batch)).not.toMatch(/"(cost|rng|jige)"/);
    }
    expect(mines).toBe(0);
  });
});

describe('event enemies in the lane stream', () => {
  test('the shadow grows and runs off at round end the same way in the stream and in a fresh full', () => {
    const m = createMatch(d3, 5, [1, 2], { noElimination: true });
    const shadowRound = d3.economy!.shadow!.round;
    jumpToTick(m, roundStartTick(d3, shadowRound) - 4);
    const streamer = new MatchStreamer(m);
    const view = applyFull(buildFull(m, 1, { watching: 1, names, key: 'k', n: 0 }));
    let pending: LaneBatch[] = [];
    let n = 0;
    const kinds = new Set<string>();
    while (m.tick < roundStartTick(d3, shadowRound + 1) + 6) {
      const step = stepMatch(m, []);
      const out = streamer.afterStep(step);
      for (const e of out.lanes[1] ?? []) kinds.add(e.t);
      if (out.mine[1]) applyMine(view, out.mine[1]);
      pending.push({ tick: step.tick, events: out.lanes[1] ?? [] });
      if (step.tick % 2 === 1) {
        n++;
        expect(applyTick(view, buildTick(m, names, n))).toBe('ok');
        expect(applyLane(view, { n, seat: 1, batches: pending })).toBe('ok');
        pending = [];
        if (m.tick % 40 === 0) expect(diffViews(view, applyFull(buildFull(m, 1, { watching: 1, names, key: 'k', n })))).toEqual([]);
      }
    }
    expect([...kinds]).toEqual(expect.arrayContaining(['grow', 'flee']));
    expect(view.lane.enemies.some(e => e.defId === d3.economy!.shadow!.enemy)).toBe(false);
  });

  test('a purchase reaches the lane stream as a note', () => {
    const m = createMatch(d3, 5, [1, 2]);
    jumpToTick(m, roundStartTick(d3, 2) + 1);
    m.lanes[1]!.coins = 100;
    const streamer = new MatchStreamer(m);
    const out = streamer.afterStep(stepMatch(m, [{ seat: 1, seq: 1, cmd: { type: 'buy', item: 'draw' } }]));
    const note = out.lanes[1]!.find(e => e.t === 'note');
    expect(note).toMatchObject({ t: 'note', ev: { type: 'buy', item: 'draw' } });
  });
});
