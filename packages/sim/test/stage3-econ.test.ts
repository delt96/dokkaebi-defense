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
    expect(first).toContainEqual({ type: 'missionEnter' });
    expect(questCommands(s, T)).toEqual([{ type: 'missionEnter' }]);
    s.coins = 19;
    expect(questCommands(s, T)).toEqual([]);
    s.coins = 100;
    s.tick = s.roundStartTick + 100;
    expect(questCommands(s, T)).toEqual([]);

    const c = lane(22, 0);
    placeUnitForTest(c, 'sotlid', 0); placeUnitForTest(c, 'bujigaengi', 1);
    expect(questCommands(c, T)).toEqual([{ type: 'combine', result: 'gamasot' }]);
    c.econ!.collection.done = ['gamasot'];
    expect(questCommands(c, T)).toEqual([]);
  });

  test('tame policy keeps buckwheat for the target and caps hidden units at two', () => {
    const st = lane(20, 75);
    step(st, []);
    const b = st.enemies.find(x => x.boss)!;
    b.hp = Math.floor(b.maxHp * 0.15); b.slow = { pct: 0.3, ticks: 100 };
    st.buckwheat = 2;
    expect(tameCommands(st, null)).toEqual([{ type: 'tame', enemyId: b.id }]);
    expect(tameCommands(st, T)).toEqual([]);
    st.buckwheat = 5;
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
    for (const k of ['market', 'drops', 'mission', 'collection', 'team', 'ssireum', 'shadow', 'tame'] as const) {
      expect(base[k]).toBeUndefined();
    }
    expect(base.ledger).toBeDefined();
    const q2 = configData(d3, STANDARD_CONFIGS.find(c => c.name === 'target-full-q2')!, 1).economy!;
    const general = (['mission', 'collection', 'team', 'ssireum'] as const).filter(k => q2[k] !== undefined);
    expect(general).toEqual(questPair(1));
    expect(q2.market && q2.tame).toBeTruthy();
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
    grade6AtFinal: 3, grade6AtEnd: 4, hidden: 1, coinsAtFinal: 412, buckwheatAtFinal: 2, firstGrade6Round: 33, firstSource: 'combine',
    buckwheat9Round: 30, buckwheat12Round: null, coins180Round: 6, coins240Round: 8,
    draws: 12, questWins: 'mission+team', tames: 1, jigeGrants: 2, jigeUses: 1, jigeHeld: 1, tameTries: 3,
    muk10: 2, muk20: 3, muk30: 0, muk40: 1, muk50: null, muk60: null, mukBlocked: true, sold: 30,
    missingAtEnd: 'moru', yeoksinKills: 4,
    boss10: 21.5, boss20: 48.25, boss30: null, boss40: 60, boss50: null, boss60: 70.1,
  }, {
    seed: 1, config: 'target-full', bot: 'target', seat: 3, finished: false, teamOutcome: 'clear', endRound: 41,
    grade6AtFinal: 0, grade6AtEnd: 0, hidden: 0, coinsAtFinal: 0, buckwheatAtFinal: 0, firstGrade6Round: null, firstSource: null,
    buckwheat9Round: null, buckwheat12Round: null, coins180Round: null, coins240Round: null,
    draws: 0, questWins: '', tames: 0, jigeGrants: 0, jigeUses: 0, jigeHeld: 0, tameTries: 0,
    muk10: null, muk20: null, muk30: null, muk40: null, muk50: null, muk60: null, mukBlocked: false, sold: 0, missingAtEnd: '', yeoksinKills: 4,
    boss10: 30, boss20: null, boss30: null, boss40: null, boss50: null, boss60: null,
  }];
}

describe('economy measurement additions', () => {
  test('jigeCommands swaps a surplus same-grade normal into the missing material, highest grade first', async () => {
    const { jigeCommands } = await import('../src/stage3/econBot');
    const s = lane(22);
    const recipe = d3.recipes.find(r => r.result === T)!;
    const missing = recipe.materials.find(m => d3.units.find(u => u.id === m)!.grade <= 4)!;
    const grade = d3.units.find(u => u.id === missing)!.grade;
    recipe.materials.filter(m => m !== missing).forEach((m, i) => placeUnitForTest(s, m, i));
    const spare = d3.units.find(u => !u.hidden && u.grade === grade && !expandHas(T, u.id))!;
    const unit = placeUnitForTest(s, spare.id, 3);
    expect(jigeCommands(s, T)).toEqual([]);
    s.econ!.jige = 1;
    expect(jigeCommands(s, T)).toEqual([{ type: 'jigeSwap', source: { zone: 'board', index: 3, unitId: unit.id }, result: missing }]);
  });

  test('--jige on/off makes distinct configs and the policy follows it', async () => {
    const { cliConfigs } = await import('../src/stage3/cli');
    const arg = (over: Record<string, string>) => (k: string, d: string) => over[k] ?? d;
    const on = cliConfigs(arg({ bot: 'synergy', jige: 'on', quests: '2' }));
    const off = cliConfigs(arg({ bot: 'synergy', jige: 'off', quests: '2' }));
    expect(on[0]!.useJige).toBe(true);
    expect(off[0]!.useJige).toBe(false);
    expect(on[0]!.name).not.toBe(off[0]!.name);
  });

  test('report helpers: in-band share, timeouts at the limit, seat spread and jige incidence', async () => {
    const { inBandShare, timeoutMedian, seatSpread, jigeIncidence } = await import('../src/stage3/report');
    expect(inBandShare([2, 3, 4, 5])).toBe(0.5);
    expect(inBandShare([])).toBeNull();
    expect(timeoutMedian([20, null, 30], 40)).toBe(30);
    const rows = [1, 2, 3].flatMap(seed => [0, 1].map(i => ({ seed, finished: true, grade6AtFinal: i === 0 ? 3 : seed === 1 ? 3 : 4, draws: 18, jigeGrants: seed === 2 ? 0 : 1 })));
    expect(seatSpread(rows as never)).toBeCloseTo((0 + 0.5 + 0.5) / 3, 9);
    expect(jigeIncidence(rows as never)).toEqual({ seats: 6, withJige: 4 });
    expect(1 - 0.97 ** 18).toBeCloseTo(0.422, 3);
  });

  test('a match row counts draws, jige grants and uses, paid tame tries and 묵 checkpoints; CSV round-trips', () => {
    const r = econMatchRun(d3, 1, { name: 'synergy-x', bot: 'synergy', noDefeat: true, market: true, quests: 2, tame: true, useJige: true });
    for (const row of r.rows) {
      expect(row.draws).toBeLessThanOrEqual(18);
      expect(row.jigeGrants - row.jigeUses).toBe(row.jigeHeld);
      expect(row.tameTries).toBeGreaterThanOrEqual(row.tames);
      expect(typeof row.muk10 === 'number' || row.muk10 === null).toBe(true);
      expect(typeof row.mukBlocked).toBe('boolean');
    }
    expect(parseEconCsv(toCsvRows(r.rows))).toEqual(r.rows);
  }, 120_000);
});
