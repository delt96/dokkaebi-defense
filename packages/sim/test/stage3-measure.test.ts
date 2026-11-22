import { expect, test } from 'vitest';
import { debuffSummary, jigePairs, tameSummary, type TameSample } from '../src/stage3/measurement';
import { loadGameData } from '@dorandi/logic';

const data = loadGameData('stage3');
test('counts distinct encounters, retries, pre-roll bands and first recipe per seat', () => {
  const spawn: TameSample = { seed: 1, seat: 2, round: 10, enemyId: 8, base: 'jinegaksi', kind: 'spawn', chance: 0, coins: 0, muk: 0, success: 0, grown: 0 };
  const attempt = { ...spawn, kind: 'attempt' as const, chance: 0.1, coins: 30 };
  const complete = { ...spawn, kind: 'complete' as const, round: 22 };
  const s = tameSummary(data, [spawn, { ...spawn, seat: 3 }, attempt, { ...attempt, chance: 0.7, success: 1 }, complete, { ...complete, round: 40 }], 6);
  expect(s[0]).toMatchObject({ appearances: 2, attempted: 1, retries: 1, retryCoins: 30, lostCoins: 60, lostMuk: 2, completed: 1, recruited: 1, starts: 6, firstRound: 22 });
  expect(s[0]?.bands.map(b => [b.attempts, b.successes])).toEqual([[1,1],[0,0],[0,0],[0,0],[1,0]]);
  expect(s[1]).toMatchObject({ recruited: 0, completed: 0, firstRound: null });
});

test('joins config arms by seed and seat, restricts incidence and handles missing firsts', () => {
  const a = { seed: 1, seat: 1, draws: 18, jigeGrants: 1, jigeHeld: 0, jigeUses: 1, finished: true, firstGrade6Round: 20, grade6AtFinal: 3 };
  const b = { ...a, seat: 2, draws: 17, firstGrade6Round: null };
  expect(jigePairs([a,b], [b,{ ...a, grade6AtFinal: 2, firstGrade6Round: 24 }])).toMatchObject({ full: 1, received: 1, pairs: 2, countDelta: 0.5, firstPairs: 1, firstDelta: -4 });
  expect(jigePairs([], [])).toMatchObject({ full: 0, firstPairs: 0, firstDelta: null });
});

test('paired combat differences use each seed and count timeouts at the limit', () => {
  expect(debuffSummary([{ control: 30, treatment: 20 }, { control: null, treatment: 50 }], 60))
    .toEqual({ n: 2, controlKills: 1, treatmentKills: 2, control: 45, treatment: 35, delta: -10 });
});

test('report reload preserves every spent currency and the actual roll outcome', async () => {
  const { readSamples } = await import('../src/stage3/measurement');
  const csv = 'seed,seat,round,enemyId,base,kind,chance,success,coins,muk,grown\n1,2,10,8,jinegaksi,attempt,0.1,0,30,0,0\n';
  expect(readSamples(csv)[0]).toMatchObject({ success: 0, coins: 30, muk: 0, chance: 0.1 });
});

test('matched probe gives identical seeded outcomes when both supports have no matching vulnerability', async () => {
  const { debuffProbe } = await import('../src/stage3/synergy');
  const d = structuredClone(data);
  for (const id of ['moru', 'yaktanggi']) {
    for (const skill of d.units.find(u => u.id === id)!.skills) skill.effects = skill.effects.filter(e => e.kind !== 'vuln');
  }
  const rows = debuffProbe(d, 3);
  expect(rows).toHaveLength(6);
  expect(rows.every(r => r.control === r.treatment)).toBe(true);
});

test('a first grade six in only one arm counts in the all-start R61 comparison', () => {
  const r = { seed: 7, seat: 4, draws: 18, jigeGrants: 2, jigeHeld: 0, jigeUses: 2, finished: false, grade6AtFinal: 0, firstGrade6Round: 59 };
  expect(jigePairs([r], [{ ...r, firstGrade6Round: null }])).toMatchObject({ firstPairs: 0, firstDelta: null, starts: 1, cappedDelta: -2 });
});

test('eager recruits at full HP, keeps muk for the exclusive partner and combines its recruit', async () => {
  const { createGame } = await import('@dorandi/logic');
  const { forceRound, placeUnitForTest, spawnEnemyForTest } = await import('@dorandi/logic/testing');
  const { eagerTames, synergyBot } = await import('../src/stage3/econBot');
  const s = createGame(data, 1);
  forceRound(s, 10);
  s.coins = 30;
  s.buckwheat = 0;
  const enemy = spawnEnemyForTest(s, 'jinegaksi', 0);
  expect(eagerTames(s)).toEqual([{ type: 'tame', enemyId: enemy.id }]);
  s.coins = 29;
  expect(eagerTames(s)).toEqual([]);

  forceRound(s, 11);
  placeUnitForTest(s, 'jinegaksi', 0);
  const bot = synergyBot(1, { market: true, quests: true, tame: true, jige: true, eager: true });
  s.buckwheat = 2;
  expect(bot.decide(s).some(c => c.type === 'buy')).toBe(false);
  expect(bot.currentTarget()).toBe('baekbalbaneulgaksi');
  placeUnitForTest(s, 'banjitgori', 1);
  s.coins = 60;
  expect(bot.decide(s)).toContainEqual({ type: 'combine', result: 'baekbalbaneulgaksi' });
});

test('max draws buys the entire available day before summons or combines', async () => {
  const { createGame } = await import('@dorandi/logic');
  const { forceRound } = await import('@dorandi/logic/testing');
  const { synergyBot } = await import('../src/stage3/econBot');
  const s = createGame(data, 1);
  forceRound(s, 11);
  s.buckwheat = 3;
  const bot = synergyBot(1, { market: true, quests: true, tame: true, maxDraws: true });
  expect(bot.decide(s)).toEqual(Array(3).fill({ type: 'buy', item: 'draw' }));
});

test('max draws carries unspent muk into the next day after selling out', async () => {
  const { createGame } = await import('@dorandi/logic');
  const { forceRound, placeUnitForTest } = await import('@dorandi/logic/testing');
  const { targetBot } = await import('../src/stage3/targetBot');
  const s = createGame(data, 1);
  forceRound(s, 20);
  s.buckwheat = 1;
  s.econ!.market = { day: 2, draws: 3 };
  placeUnitForTest(s, 'gawi', 0);
  placeUnitForTest(s, 'golmu', 1);
  const bot = targetBot(1, { targets: ['banjitgori'], policy: { market: true, quests: false, tame: false, maxDraws: true } });
  expect(bot.decide(s)).not.toContainEqual({ type: 'combine', result: 'banjitgori' });
  forceRound(s, 60);
  s.econ!.market = { day: 6, draws: 3 };
  expect(bot.decide(s)).toContainEqual({ type: 'combine', result: 'banjitgori' });
});

test('the draw report compares 18-draw incidence to the configured grant probability', async () => {
  const { drawMarkdown } = await import('../src/stage3/measurement');
  const r = { seed: 1, seat: 1, draws: 18, jigeGrants: 1, jigeHeld: 0, jigeUses: 1, finished: true, grade6AtFinal: 0, firstGrade6Round: null };
  expect(drawMarkdown([r, { ...r, seat: 2, jigeGrants: 0, jigeUses: 0 }], [], 0.03)).toContain('42.2% | +7.8%p');
});
