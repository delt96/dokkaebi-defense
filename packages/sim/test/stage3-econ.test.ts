import { describe, expect, test } from 'vitest';
import {
  createGame, createMatch, loadGameData, roundStartTick, step, stepMatch, type Command, type GameState,
} from '@dorandi/logic';
import { forceRound, jumpToTick, placeUnitForTest } from '@dorandi/logic/testing';
import {
  buckwheatNeed, marketCommands, questCommands, reserveCoins, switchBot, tameCommands, type EconPolicy,
} from '../src/stage3/econBot';
import { EconDriver } from '../src/stage3/econDriver';
import { expandTree, targetBot } from '../src/stage3/targetBot';

const d3 = loadGameData('stage3');
const ALL: EconPolicy = { market: true, quests: true, tame: true };
const T = 'cheonnyeonjing';

function lane(round: number, coins = 0): GameState {
  const s = createGame(d3, 1);
  if (round > 0) forceRound(s, round);
  s.coins = coins;
  return s;
}

const count = (cmds: Command[], type: string, item?: string) =>
  cmds.filter(c => c.type === type && (item === undefined || (c as { item?: string }).item === item)).length;

describe('stage 3 economy bot policies', () => {
  test('market policy buys two bundles a day while coins stay above the reserve', () => {
    const s = lane(1, 200);
    expect(reserveCoins(s, T)).toBe(0);
    expect(count(marketCommands(s, null), 'buy', 'bundle')).toBe(2);
    s.econ!.bundle = { day: 1, bought: 1, left: [3, 2] };
    expect(count(marketCommands(s, null), 'buy', 'bundle')).toBe(1);

    const t = lane(1, 100);
    t.buckwheat = 5;
    placeUnitForTest(t, 'janggu', 0);
    expect(reserveCoins(t, T)).toBe(60);
    expect(count(marketCommands(t, T), 'buy', 'bundle')).toBe(0);
    t.coins = 115;
    expect(count(marketCommands(t, T), 'buy', 'bundle')).toBe(1);
    expect(marketCommands(lane(0, 500), null)).toEqual([]);
  });

  test('jar is bought only when buckwheat is short of the next two grade-5s and the final combine', () => {
    const s = lane(1, 1000);
    s.econ!.bundle = { day: 1, bought: 2, left: [3, 3, 2] };
    expect(buckwheatNeed(s, T)).toBe(3);
    s.buckwheat = 2;
    expect(marketCommands(s, T)).toEqual([{ type: 'buy', item: 'jar' }]);
    s.buckwheat = 3;
    expect(marketCommands(s, T)).toEqual([]);
    placeUnitForTest(s, 'janggu', 0);
    expect(buckwheatNeed(s, T)).toBe(2);
    expect(buckwheatNeed(s, null)).toBe(0);
  });

  test('quest policy sets the story target once per change and enters the mission when it can pay', () => {
    const s = lane(12, 20);
    s.tick = s.roundStartTick + 10;
    const first = questCommands(s, T);
    expect(first).toContainEqual({ type: 'storyTarget', id: T });
    expect(first).toContainEqual({ type: 'missionEnter' });
    s.econ!.story.target = T;
    expect(questCommands(s, T)).toEqual([{ type: 'missionEnter' }]);
    s.coins = 19;
    expect(questCommands(s, T)).toEqual([]);
    s.coins = 100;
    s.tick = s.roundStartTick + 100;
    expect(questCommands(s, T)).toEqual([]);

    const c = lane(22, 0);
    c.econ!.story.target = T;
    placeUnitForTest(c, 'sotlid', 0); placeUnitForTest(c, 'bujigaengi', 1);
    expect(questCommands(c, T)).toEqual([{ type: 'combine', result: 'gamasot' }]);
    c.econ!.collection.done = ['gamasot'];
    expect(questCommands(c, T)).toEqual([]);
  });

  test('tame policy keeps buckwheat for the target and caps hidden units at two', () => {
    const st = lane(20);
    step(st, []);
    const b = st.enemies.find(x => x.boss)!;
    b.hp = Math.floor(b.maxHp * 0.15); b.slow = { pct: 0.3, ticks: 100 };
    st.buckwheat = 1;
    expect(tameCommands(st, null)).toEqual([{ type: 'tame', enemyId: b.id }]);
    expect(tameCommands(st, T)).toEqual([]);
    st.buckwheat = 4;
    expect(tameCommands(st, T)).toEqual([{ type: 'tame', enemyId: b.id }]);
    st.econ!.tamed = ['jinegaksi', 'bulgasari'];
    expect(tameCommands(st, T)).toEqual([]);
  });

  test('switch bot moves to a target at least 4 value cheaper and stays otherwise', () => {
    let seed = 1;
    let bot = switchBot(seed, ALL);
    let s = lane(1, 0);
    bot.decide(s);
    while (expandHas(bot.currentTarget()!, 'janggu') || expandHas(bot.currentTarget()!, 'moru')) { seed++; bot = switchBot(seed, ALL); s = lane(1, 0); bot.decide(s); }
    const before = bot.currentTarget()!;
    bot.decide(s);
    expect(bot.currentTarget()).toBe(before);
    placeUnitForTest(s, 'janggu', 10); placeUnitForTest(s, 'moru', 11);
    bot.decide(s);
    expect(bot.currentTarget()).toBe(before);
    forceRound(s, 2);
    bot.decide(s);
    expect(bot.currentTarget()).toBe(T);
    forceRound(s, 3);
    bot.decide(s);
    expect(bot.currentTarget()).toBe(T);
  });

  test('target bot with a policy never sells its four strongest non-tree units', () => {
    const tree = expandTree(d3, T);
    const one = d3.units.find(u => u.grade === 1 && (tree.get(u.id) ?? 0) > 0)!.id;
    const strong = d3.units.filter(u => u.grade === 5 && !tree.has(u.id)).slice(0, 4).map(u => u.id);
    const board = () => {
      const s = lane(5, 0);
      strong.forEach((id, k) => placeUnitForTest(s, id, k));
      for (let k = 4; k < 18; k++) placeUnitForTest(s, one, k);
      s.tokens = 1;
      return s;
    };
    const sold = (policy?: EconPolicy) => {
      const cmds = targetBot(1, { targets: [T], ...(policy && { policy }) }).decide(board());
      return (cmds.find(c => c.type === 'sell') as { slot: number } | undefined)?.slot;
    };
    expect(sold()).toBeLessThan(4);
    const withPolicy = sold({ market: false, quests: false, tame: false });
    expect(withPolicy).toBeDefined();
    expect(withPolicy).toBeGreaterThanOrEqual(4);
  });

  test('driver offers a unit another seat lacks and the receiver accepts', () => {
    const m = createMatch(d3, 1, [1, 2]);
    jumpToTick(m, roundStartTick(d3, 22) + 1);
    while (m.tick % 10 !== 0) stepMatch(m, []);
    m.lanes[1]!.econ!.jige = true;
    m.lanes[1]!.tokens = 0; m.lanes[2]!.tokens = 0;
    const other = d3.units.find(u => u.grade === 6 && !u.hidden && !expandHas(u.id, 'moru'))!.id;
    const b1 = targetBot(1, { targets: [other], policy: { market: false, quests: false, tame: false } });
    const b2 = targetBot(2, { targets: [T], policy: { market: false, quests: false, tame: false } });
    placeUnitForTest(m.lanes[1]!, 'moru', 12);
    for (let k = 0; k < 18; k++) if (!m.lanes[2]!.slots[k] && k !== 5) placeUnitForTest(m.lanes[2]!, 'janggu', k);
    m.lanes[2]!.slots[0] = null;
    const driver = new EconDriver(m, [b1, b2], { transfer: true });
    let offered = false;
    let accepted = false;
    for (let k = 0; k < 40 && !accepted; k++) {
      const r = stepMatch(m, driver.inputs());
      if (r.events.some(e => e.type === 'transferOffer' && e.from === 1 && e.to === 2 && e.defId === 'moru')) offered = true;
      if (r.events.some(e => e.type === 'transferEnd' && e.outcome === 'accepted')) accepted = true;
    }
    expect(offered).toBe(true);
    expect(accepted).toBe(true);
    expect(m.lanes[2]!.slots.some(u => u?.defId === 'moru' && u.delivered)).toBe(true);
  });
});

function expandHas(target: string, id: string): boolean {
  const recipeOf = new Map(d3.recipes.map(r => [r.result, r]));
  const walk = (x: string): boolean => x === id || (recipeOf.get(x)?.materials ?? []).some(walk);
  return walk(target);
}
