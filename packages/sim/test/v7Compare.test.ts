import { expect, test } from 'vitest';
import { parseEconCsv } from '../src/stage3/econRun';
import { compareEcon } from '../scripts/v7-compare';

const csv = [
  'seed,config,bot,seat,finished,teamOutcome,endRound,firstGrade6Round,boss20,boss40,boss60',
  '1,c,target,0,true,clear,70,20,30,40,60',
  '1,c,target,1,false,wipe,34,,31,41,',
  '2,c,target,0,false,gate,57,22,32,42,62',
].join('\n');

test('the same rows give no change and no easier flag', () => {
  const rows = parseEconCsv(csv);
  const c = compareEcon(rows, rows);
  expect(c.completion.before).toBeCloseTo(1 / 3);
  expect(c.completion.after).toBe(c.completion.before);
  expect(c.defeatBins.before).toEqual({ '31~40': 1, '51~60': 1 });
  expect(c.boss60.before).toBe(61);
  expect(c.boss60.after).toBe(c.boss60.before);
  expect(c.firstGrade6.before).toBe(21);
  expect(c.easier).toBe(false);
});

const rowsOf = (finished: number, total: number, boss60: number): ReturnType<typeof parseEconCsv> =>
  parseEconCsv([
    'seed,config,bot,seat,finished,teamOutcome,endRound,firstGrade6Round,boss20,boss40,boss60',
    ...Array.from({ length: total }, (_, i) => `1,c,target,${i},${i < finished},clear,70,20,30,40,${boss60}`),
  ].join('\n'));

test('completion up by more than 10 points is flagged easier', () => {
  expect(compareEcon(rowsOf(10, 20, 60), rowsOf(13, 20, 60)).easier).toBe(true);
});

test('a boss 60 kill time more than 15% shorter is flagged easier', () => {
  expect(compareEcon(rowsOf(10, 20, 60), rowsOf(10, 20, 48)).easier).toBe(true);
});

test('a slower boss 60 and a small completion gain are not flagged', () => {
  expect(compareEcon(rowsOf(10, 20, 60), rowsOf(11, 20, 72)).easier).toBe(false);
});
