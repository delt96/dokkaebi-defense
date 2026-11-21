import { describe, expect, test } from 'vitest';
import {
  applyMine, buildFull, buyCheck, createGame, createMatch, econView, loadGameData, MatchStreamer, roundStartTick, step, stepMatch,
  type MatchCommand, type MatchState,
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
    expect(econView(s)!.market!.why).toEqual({ bundle: 'marketClosed', jar: 'marketClosed' });
    forceRound(s, 1);
    s.coins = 40;
    let v = econView(s)!.market!;
    expect(v.why).toEqual({ bundle: 'noCoins', jar: null });
    expect(v.deck).toEqual([{ grade: 3, left: 2 }, { grade: 2, left: 1 }]);
    expect(v.jar).toMatchObject({ price: 35, left: 1, chance: 0.5, missed: false });
    s.coins = 1000;
    for (let i = 0; i < s.slots.length; i++) if (s.open[i]) placeUnitForTest(s, 'jipsin', i);
    expect(buyCheck(s, 'bundle')).toBe('noSlot');
    expect(econView(s)!.market!.why.bundle).toBe('noSlot');
    s.slots[0] = null;
    step(s, [{ type: 'buy', item: 'bundle' }]);
    v = econView(s)!.market!;
    expect(v.bundle.left).toBe(1);
    expect(v.deck.reduce((a, d) => a + d.left, 0)).toBe(2);
  });

  test('tame part lists living targets with their limit and tameCheck reason', () => {
    const s = createGame(d3, 1);
    forceRound(s, 20);
    const boss = spawnEnemyForTest(s, 'gangcheori', 1, 1000);
    boss.maxHp = 10000;
    s.buckwheat = 1;
    let t = econView(s)!.tame;
    expect(t).toEqual([{ enemyId: boss.id, defId: 'gangcheori', unit: 'gangcheori', cost: { buckwheat: 1 }, needs: 'slowed', hpLimit: 1500, why: 'tameCondition' }]);
    boss.slow = { pct: 0.3, ticks: 10 };
    expect(econView(s)!.tame[0]!.why).toBeNull();
    boss.hp = 1501;
    expect(econView(s)!.tame[0]!.why).toBe('tameHp');
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

  test('a buy and a transfer offer reach both seats through mine, and full agrees with the stream', () => {
    const { m, streamer } = start();
    m.lanes[1]!.coins = 500;
    m.lanes[1]!.econ!.jige = true;
    const view = buildFull(m, 2, { watching: 2, names, key: 'k', n: 0 });
    let r = stepMatch(m, [{ seat: 1, seq: 1, cmd: { type: 'buy', item: 'jar' } }]);
    let out = streamer.afterStep(r);
    expect(out.mine[1]!.econ!.market!.jar.left === 0 || out.mine[1]!.econ!.market!.jar.missed).toBe(true);
    const unit = placeUnitForTest(m.lanes[1]!, 'jipsin', 5);
    const offer: MatchCommand = { type: 'transferOffer', target: 2, slot: 5, unitId: unit.id };
    r = stepMatch(m, [{ seat: 1, seq: 2, cmd: offer }]);
    out = streamer.afterStep(r);
    const t2 = out.mine[2]!.econ!.transfer!;
    expect(t2.offer).toEqual({ from: 1, to: 2, slot: 5, unitId: unit.id, defId: 'jipsin', deadlineTick: r.tick + 200 });
    expect(t2.busy).toEqual([1, 2]);
    applyMine(view, out.mine[2]!);
    expect(view.mine.econ).toEqual(buildFull(m, 2, { watching: 2, names, key: 'k', n: 0 }).mine.econ);
    r = stepMatch(m, [{ seat: 2, seq: 1, cmd: { type: 'transferAccept', slot: 0 } }]);
    out = streamer.afterStep(r);
    expect(out.mine[2]!.econ!.transfer).toMatchObject({ offer: null, ready: m.round + 5, rewarded: true, rewardsLeft: 4 });
    expect(out.mine[1]!.econ!.transfer!.readyRounds).toEqual({ 1: m.round + 5, 2: m.round + 5 });
  });
});
