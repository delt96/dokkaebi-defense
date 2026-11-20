import { describe, expect, test } from 'vitest';
import { createRng, nextFloat, nextInt, deriveSeed } from '../src/rng';

describe('rng', () => {
  test('same seed gives same sequence in [0,1)', () => {
    const a = createRng(42), b = createRng(42);
    const xs = Array.from({ length: 5 }, () => nextFloat(a));
    const ys = Array.from({ length: 5 }, () => nextFloat(b));
    expect(xs).toEqual(ys);
    for (const x of xs) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(1); }
  });
  test('different seeds differ', () => {
    expect(nextFloat(createRng(1))).not.toBe(nextFloat(createRng(2)));
  });
  test('nextInt covers 0..n-1', () => {
    const r = createRng(7); const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) { const v = nextInt(r, 6); expect(Number.isInteger(v)).toBe(true); seen.add(v); }
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4, 5]);
  });
  test('deriveSeed is stable and separates labels', () => {
    expect(deriveSeed(7, 'summon')).toBe(deriveSeed(7, 'summon'));
    expect(deriveSeed(7, 'summon')).not.toBe(deriveSeed(7, 'combat'));
  });
  test('state survives JSON copy', () => {
    const r = createRng(3); nextFloat(r);
    const copy = JSON.parse(JSON.stringify(r));
    expect(nextFloat(copy)).toBe(nextFloat(r));
  });
});
