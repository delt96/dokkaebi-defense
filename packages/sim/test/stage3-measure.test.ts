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
