import { describe, expect, test } from 'vitest';
import { loadGameData } from '@dorandi/logic';
import { goldenRun } from '../src/golden';
import golden from './golden-stage1.json';

const data = loadGameData();

describe('stage 1 golden', () => {
  test('file covers normal and clumsy seeds 1-5', () => {
    expect(Object.keys(golden).sort()).toEqual(['clumsy:1', 'clumsy:2', 'clumsy:3', 'clumsy:4', 'clumsy:5', 'normal:1', 'normal:2', 'normal:3', 'normal:4', 'normal:5']);
  });
  for (const [key, expected] of Object.entries(golden)) {
    test(`${key} matches every 100-tick state hash and the full event hash`, () => {
      const [bot, seed] = key.split(':') as ['normal' | 'clumsy', string];
      expect(goldenRun(data, Number(seed), bot)).toEqual(expected);
    }, 60_000);
  }
});
