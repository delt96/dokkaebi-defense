import { describe, expect, test } from 'vitest';
import { canonicalJson, chainHash, fnv1a, stateHash } from '../src/hash';

describe('hash', () => {
  test('canonical json sorts keys, drops skipped keys at any depth and undefined values', () => {
    expect(canonicalJson({ b: 1, a: { data: 5, c: [2, { z: 1, y: undefined }] }, data: 9 })).toBe('{"a":{"c":[2,{"z":1}]},"b":1}');
  });
  test('fnv1a is 8 hex chars and stable', () => {
    expect(fnv1a('')).toBe('811c9dc5');
    expect(fnv1a('a')).toBe('e40c292c');
  });
  test('stateHash ignores key order; chainHash depends on history', () => {
    expect(stateHash({ x: 1, y: 2 })).toBe(stateHash({ y: 2, x: 1 }));
    expect(chainHash(chainHash('', 1), 2)).not.toBe(chainHash(chainHash('', 2), 1));
  });
});
