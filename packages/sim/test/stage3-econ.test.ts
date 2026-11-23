import { describe, expect, test } from 'vitest';
import {
  boardDps, createGame, createMatch, loadGameData, roundStartTick, step, stepMatch, type Command, type GameState,
} from '@dorandi/logic';
import { forceRound, jumpToTick, placeUnitForTest, spawnEnemyForTest } from '@dorandi/logic/testing';
import {
  BOT_HUNT_SHARE, buckwheatNeed, huntCommands, questCommands, reserveCoins, surplusGamble, switchBot, tameCommands, type EconPolicy,
} from '../src/stage3/econBot';
import { EconDriver } from '../src/stage3/econDriver';
import { expandTree, targetBot } from '../src/stage3/targetBot';
import {
  configData, econMarkdown, econMatchRun, econSummary, parseEconCsv, parseYeoksinCsv, questPair, STANDARD_CONFIGS, type EconRow,
} from '../src/stage3/econRun';
import { toCsvRows } from '../src/stage3/report';

const d3 = loadGameData('stage3');
const ALL: EconPolicy = { quests: true, tame: true };
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
  test('gamble driver protects the last 묵 for its final combine', () => {
    const m = createMatch(d3, 1, [1]);
    const s = m.lanes[1]!;
    forceRound(s, 30);
    s.econ!.marketOpen = true;
    for (const [i, id] of d3.recipes.find(r => r.result === T)!.materials.entries()) placeUnitForTest(s, id, i);
    s.coins = 185;
    s.buckwheat = 1;
    const driver = new EconDriver(m, [{ name: 'recipe', decide: () => [], currentTarget: () => T }], true);
    expect(buckwheatNeed(s, T)).toBe(1);
    expect(driver.inputs().map(i => i.cmd)).toEqual([{ type: 'gambleCoins', stake: 100 }]);
    s.coins = 0;
    s.buckwheat = 2;
    expect(surplusGamble(s, T)).toEqual({ type: 'gambleUnit', table: 'small' });
    s.buckwheat = 4;
    expect(surplusGamble(s, T)).toEqual({ type: 'gambleUnit', table: 'big' });
    forceRound(s, 29);
    expect(surplusGamble(s, T)).toEqual({ type: 'gambleUnit', table: 'small' });
  });

  test('격파 policy summons a ready target the board can kill, never during a boss or near the limit', () => {
    const s = lane(5, 100);
    s.spawned = d3.balance.spawnCount;
    expect(huntCommands(s, T)).toEqual([]);
    for (let i = 0; i < 6; i++) placeUnitForTest(s, 'samtaegi', i);
    const hp = d3.economy!.hunts!.targets[0]!.hp;
    expect(BOT_HUNT_SHARE * boardDps(s) * d3.economy!.hunts!.seconds).toBeGreaterThanOrEqual(hp);
    expect(huntCommands(s, T)).toEqual([{ type: 'hunt', enemy: 'ev_soebap' }]);
    s.coins = d3.economy!.hunts!.targets[0]!.fee - 1;
    expect(huntCommands(s, T)).toEqual([]);
    s.coins = 100;
    step(s, huntCommands(s, T));
    expect(huntCommands(s, T)).toEqual([]);
    const b = lane(10, 100);
    for (let i = 0; i < 6; i++) placeUnitForTest(b, 'samtaegi', i);
    spawnEnemyForTest(b, 'jinegaksi', 3);
    expect(huntCommands(b, T)).toEqual([]);
  });

  test('bundle policy respects the shared quota and leaves the coin switch independent', () => {
    const s = lane(30, 185);
    s.econ!.marketOpen = true;
    s.buckwheat = buckwheatNeed(s, T) + 5;
    expect(surplusGamble(s, T, false)).toEqual({ type: 'gambleUnit', table: 'big' });
    s.econ!.gamble = { round: 30, units: 2, coins: 0 };
    expect(surplusGamble(s, T, false)).toBeNull();
    expect(surplusGamble(s, T)).toEqual({ type: 'gambleCoins', stake: 100 });
  });

  test('quest policy makes the missing collection combines', () => {
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
      for (let k = 4; k < 24; k++) placeUnitForTest(s, one, k);
      s.tokens = 1;
      return s;
    };
    const sold = (policy?: EconPolicy) => {
      const cmds = targetBot(1, { targets: [T], ...(policy && { policy }) }).decide(board());
      return (cmds.find(c => c.type === 'sell') as { slot: number } | undefined)?.slot;
    };
    expect(sold()).toBeLessThan(4);
    const withPolicy = sold({ quests: false, tame: false });
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
  test('questPair cycles the three pairs of three quests', () => {
    const pairs = [1, 2, 3].map(s => questPair(s).join('+'));
    expect(new Set(pairs).size).toBe(3);
    expect(questPair(4)).toEqual(questPair(1));
    for (const p of pairs) expect(p.split('+').length).toBe(2);
  });

  test('configData switches sections off', () => {
    const base = configData(d3, STANDARD_CONFIGS.find(c => c.name === 'target-base')!, 1).economy!;
    for (const k of ['market', 'drops', 'collection', 'team', 'ssireum', 'shadow', 'tame'] as const) {
      expect(base[k]).toBeUndefined();
    }
    expect(base.ledger).toBeDefined();
    expect(base.hunts).toBeDefined();
    expect(configData(d3, { ...STANDARD_CONFIGS[0]!, hunts: false }, 1).economy!.hunts).toBeUndefined();
    const q2 = configData(d3, STANDARD_CONFIGS.find(c => c.name === 'target-full-q2')!, 1).economy!;
    const general = (['collection', 'team', 'ssireum'] as const).filter(k => q2[k] !== undefined);
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
      expect(r.endRound).toBe(70);
      expect(r).toHaveProperty('boss70');
      expect(r.muk70).not.toBeNull();
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

  test('the summary judges grade 6 at round 60 and adds the end count and late defeats', () => {
    const md = econMarkdown(econMatchRunStub(), []);
    expect(md).toContain('| 70R 보유 중앙값 |');
    expect(md).toContain('| 61R 이후 탈락 |');
    expect(md).toContain('묵 R10 / 20 / 30 / 40 / 50 / 60 / 70 중앙값');
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
    draws: 12, questWins: 'collection+team', tames: 1, jigeGrants: 2, jigeUses: 1, jigeHeld: 1, tameTries: 3,
    muk10: 2, muk20: 3, muk30: 0, muk40: 1, muk50: null, muk60: null, muk70: 1, mukBlocked: true, huntKills: 7, huntFled: 1, huntBest: 4, huntMuk: 9, sold: 30,
    missingAtEnd: 'moru', yeoksinKills: 4,
    boss10: 21.5, boss20: 48.25, boss30: null, boss40: 60, boss50: null, boss60: 70.1, boss70: 64,
  }, {
    seed: 1, config: 'target-full', bot: 'target', seat: 3, finished: false, teamOutcome: 'clear', endRound: 41,
    grade6AtFinal: 0, grade6AtEnd: 0, hidden: 0, coinsAtFinal: 0, buckwheatAtFinal: 0, firstGrade6Round: null, firstSource: null,
    buckwheat9Round: null, buckwheat12Round: null, coins180Round: null, coins240Round: null,
    draws: 0, questWins: '', tames: 0, jigeGrants: 0, jigeUses: 0, jigeHeld: 0, tameTries: 0,
    muk10: null, muk20: null, muk30: null, muk40: null, muk50: null, muk60: null, muk70: null, mukBlocked: false, huntKills: 0, huntFled: 0, huntBest: 0, huntMuk: 0, sold: 0, missingAtEnd: '', yeoksinKills: 4,
    boss10: 30, boss20: null, boss30: null, boss40: null, boss50: null, boss60: null, boss70: null,
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

  test('report helpers: in-band share, timeouts at the limit, seat spread', async () => {
    const { inBandShare, timeoutMedian, seatSpread } = await import('../src/stage3/report');
    expect(inBandShare([2, 3, 4, 5])).toBe(0.5);
    expect(inBandShare([])).toBeNull();
    expect(timeoutMedian([20, null, 30], 40)).toBe(30);
    const rows = [1, 2, 3].flatMap(seed => [0, 1].map(i => ({ seed, finished: true, grade6AtFinal: i === 0 ? 3 : seed === 1 ? 3 : 4 })));
    expect(seatSpread(rows as never)).toBeCloseTo((0 + 0.5 + 0.5) / 3, 9);
  });

  test('a match row counts draws, jige grants and uses, paid tame tries and 묵 checkpoints; CSV round-trips', () => {
    const r = econMatchRun(d3, 1, { name: 'synergy-x', bot: 'synergy', noDefeat: true, market: true, quests: 2, tame: true, useJige: true, gamble: true });
    expect(r.rows.some(row => row.unitMuk! > 0)).toBe(true);
    expect(r.rows.some(row => row.huntWins)).toBe(true);
    for (const row of r.rows) {
      expect(row.unitMuk).toBe(row.smallPlays! + 3 * row.bigPlays!);
      expect(row.unitConsolation).toBeGreaterThanOrEqual(15 * row.gambleMiss!);
      expect(row.huntWins!.split('+').filter(Boolean)).toHaveLength(row.huntKills);
      expect(row.draws).toBe(row.smallPlays! + row.bigPlays!);
      expect(row.earnedMuk).toBe(row.bossMuk! + row.huntMuk + row.questMuk! + row.yeoksinMuk!);
      expect(row.yeoksinMuk).toBe(row.yeoksinKills * d3.coop!.killReward.buckwheat);
      expect(row.lostMuk).toBe(0);
      expect(row.startMuk! + row.earnedMuk!).toBe(row.unitMuk! + row.grade5Muk! + row.finalMuk! + row.tameMuk! + row.endMuk!);
      expect(row.jigeGrants - row.jigeUses).toBe(row.jigeHeld);
      expect(row.tameTries).toBeGreaterThanOrEqual(row.tames);
      expect(typeof row.muk10 === 'number' || row.muk10 === null).toBe(true);
      expect(typeof row.mukBlocked).toBe('boolean');
    }
    expect(parseEconCsv(toCsvRows(r.rows))).toEqual(r.rows);
  }, 120_000);
});

describe('R10 paired tame probe summary', () => {
  test('median cut at and above 10%, with failed, unattempted and incomplete pairs counted apart', async () => {
    const { r10Summary } = await import('../src/stage3/r10probe');
    const pair = (over: Partial<import('../src/stage3/r10probe').R10Pair>) => ({
      seed: 1, seat: 1, attempted: true, recruited: true, survivedTreatment: true, survivedControl: true,
      liveTicksTreatment: 900, liveTicksControl: 1000, ...over,
    });
    const at = r10Summary([pair({}), pair({ liveTicksTreatment: 950 }), pair({ liveTicksTreatment: 850 })]);
    expect(at.medianCut).toBeCloseTo(0.1, 9);
    expect(at.pass).toBe(true);
    const above = r10Summary([pair({ liveTicksTreatment: 880 }), pair({ liveTicksTreatment: 890 }), pair({ liveTicksTreatment: 870 })]);
    expect(above.medianCut).toBeCloseTo(0.12, 9);
    expect(above.pass).toBe(false);
    const mixed = r10Summary([pair({}), pair({ recruited: false }), pair({ attempted: false, recruited: false }), pair({ survivedControl: false })]);
    expect([mixed.recruited, mixed.failed, mixed.unattempted, mixed.incomplete, mixed.pairs]).toEqual([2, 1, 1, 1, 1]);
    expect(r10Summary([pair({ recruited: false })])).toMatchObject({ pairs: 0, medianCut: null, pass: null });
  });
});
