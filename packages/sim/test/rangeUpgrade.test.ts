import { describe, expect, test } from 'vitest';
import { createGame, loadGameData } from '@dorandi/logic';
import { cheapestUpgrade, rangeUpgrade } from '../src/bots';

describe('range upgrade policy', () => {
  const d3 = loadGameData('stage3');
  const price = d3.upgrades.find(u => u.id === 'range')!.costPerLevel;

  test('rangeUpgrade buys it once the coins cover it, and only once', () => {
    const s = createGame(d3, 1);
    expect(rangeUpgrade(s, price - 1)).toBeNull();
    expect(rangeUpgrade(s, price)).toBe('range');
    s.upgrades.range = 1;
    expect(rangeUpgrade(s, Infinity)).toBeNull();
  });

  test('stages without it never buy it, and the cheapest-upgrade bots leave it alone', () => {
    expect(rangeUpgrade(createGame(loadGameData('stage1'), 1), Infinity)).toBeNull();
    const s = createGame(d3, 1);
    s.upgrades = { physical: 10, magical: 10, polish: 10 };
    s.coins = 10_000;
    expect(cheapestUpgrade(s)).toBeNull();
  });
});
