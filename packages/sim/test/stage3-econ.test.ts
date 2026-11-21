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
import {
  configData, econMatchRun, econSummary, parseEconCsv, parseYeoksinCsv, questPair, STANDARD_CONFIGS, type EconRow,
} from '../src/stage3/econRun';
import { toCsvRows } from '../src/stage3/report';

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
  test('draw policy reserves recipe buckwheat after the opening draw', () => {
    const s = lane(1, 0);
    expect(marketCommands(s, T)).toEqual([{ type: 'buy', item: 'draw' }]);
    forceRound(s, 11);
    s.buckwheat = buckwheatNeed(s, T);
    expect(marketCommands(s, T)).toEqual([]);
    s.buckwheat += 5;
    expect(marketCommands(s, T)).toHaveLength(3);
    expect(marketCommands(s, T, 1)).toHaveLength(1);
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

describe('six-seat grade 6 measurement', () => {
  test('questPair cycles the six pairs of four quests', () => {
    const pairs = [1, 2, 3, 4, 5, 6].map(s => questPair(s).join('+'));
    expect(new Set(pairs).size).toBe(6);
    expect(questPair(7)).toEqual(questPair(1));
    for (const p of pairs) expect(p.split('+').length).toBe(2);
  });

  test('configData switches sections off', () => {
    const base = configData(d3, STANDARD_CONFIGS.find(c => c.name === 'target-base')!, 1).economy!;
    for (const k of ['market', 'drops', 'story', 'mission', 'collection', 'team', 'ssireum', 'shadow', 'tame', 'transfer'] as const) {
      expect(base[k]).toBeUndefined();
    }
    expect(base.ledger).toBeDefined();
    const q2 = configData(d3, STANDARD_CONFIGS.find(c => c.name === 'target-full-q2')!, 1).economy!;
    const general = (['mission', 'collection', 'team', 'ssireum'] as const).filter(k => q2[k] !== undefined);
    expect(general).toEqual(questPair(1));
    expect(q2.market && q2.story && q2.tame && q2.transfer).toBeTruthy();
    const nd = configData(d3, { ...STANDARD_CONFIGS[0]!, noDefeat: true }, 1);
    expect(nd.balance.limit).toBe(1e9);
    expect(d3.balance.limit).not.toBe(1e9);
  });

  test('econMatchRun is deterministic and counts only normal grade 6', () => {
    const c = { ...STANDARD_CONFIGS.find(x => x.name === 'target-full')!, noDefeat: true };
    const a = econMatchRun(d3, 1, c);
    const b = econMatchRun(d3, 1, c);
    expect(a).toEqual(b);
    expect(a.rows.length).toBe(6);
    for (const r of a.rows) {
      expect(r.finished).toBe(true);
      expect(r.grade6AtEnd).toBeGreaterThanOrEqual(0);
      expect(r.endRound).toBe(60);
    }
    expect(a.rows.some(r => r.draws > 0)).toBe(true);
  }, 120_000);

  test('econSummary applies the pass line on finishers only', () => {
    const row = (g: number, finished = true, first: number | null = 30) =>
      ({ finished, grade6AtFinal: g, firstGrade6Round: first }) as EconRow;
    const pass = [3, 3, 3, 3, 3, 4, 4, 2, 5, 3].map(g => row(g));
    const s = econSummary([...pass, row(0, false, null), row(0, false, null)]);
    expect([s.finishers, s.share34, s.neverRate, s.medianCount, s.pass]).toEqual([10, 0.8, 0, 3, true]);
    expect(s.dist).toEqual([0, 0, 1, 6, 2, 1]);
    const fail = [3, 3, 3, 3, 4, 4, 2, 2, 5, 5].map(g => row(g));
    expect(econSummary(fail).pass).toBe(false);
    const never = [...pass.slice(0, 9), row(0, true, null)];
    expect(econSummary(never).pass).toBe(false);
  });

  test('econ rows survive a CSV round trip', () => {
    const rows = econMatchRunStub();
    expect(parseEconCsv(toCsvRows(rows))).toEqual(rows);
    expect(parseYeoksinCsv('seed,stage1,stage2\n1,12.5,\n2,,30\n')).toEqual([[12.5, null], [null, 30]]);
  });
});

function econMatchRunStub(): EconRow[] {
  return [{
    seed: 1, config: 'target-full', bot: 'target', seat: 2, finished: true, teamOutcome: 'clear', endRound: 60,
    grade6AtFinal: 3, grade6AtEnd: 4, hidden: 1, coinsAtFinal: 412, buckwheatAtFinal: 2, firstGrade6Round: 33, firstSource: 'story', storyOffers: 1, storyAward: 1,
    buckwheat9Round: 30, buckwheat12Round: null, coins180Round: 6, coins240Round: 8,
    draws: 12, questWins: 'mission+team', tames: 1, transfersSent: 1, transfersReceived: 0, sold: 30,
    missingAtEnd: 'moru', yeoksinKills: 4,
    boss10: 21.5, boss20: 48.25, boss30: null, boss40: 60, boss50: null, boss60: 70.1,
  }, {
    seed: 1, config: 'target-full', bot: 'target', seat: 3, finished: false, teamOutcome: 'clear', endRound: 41,
    grade6AtFinal: 0, grade6AtEnd: 0, hidden: 0, coinsAtFinal: 0, buckwheatAtFinal: 0, firstGrade6Round: null, firstSource: null, storyOffers: 0, storyAward: 0,
    buckwheat9Round: null, buckwheat12Round: null, coins180Round: null, coins240Round: null,
    draws: 0, questWins: '', tames: 0, transfersSent: 0, transfersReceived: 0, sold: 0, missingAtEnd: '', yeoksinKills: 4,
    boss10: 30, boss20: null, boss30: null, boss40: null, boss50: null, boss60: null,
  }];
}
