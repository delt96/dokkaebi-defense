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
