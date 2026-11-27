import { describe, expect, test } from 'vitest';
import { loadGameData } from '@dorandi/logic';
import {
  actionOf, assignNumKey, clearAction, DEFAULT_NUM_KEYS, keyOf, numKeyName, numKeyOfCode, readNumKeys, splitAction, writeNumKeys,
} from '../src/ui/numkeys';

const KEY = 'dorandi.numKeys';

function memory(init: Record<string, string> = {}): Storage {
  const store = new Map(Object.entries(init));
  return {
    get length() { return store.size; },
    clear: () => store.clear(),
    getItem: (k: string) => store.get(k) ?? null,
    key: (i: number) => [...store.keys()][i] ?? null,
    removeItem: (k: string) => { store.delete(k); },
    setItem: (k: string, v: string) => { store.set(k, v); },
  };
}

describe('number key assignment', () => {
  test('defaults', () => {
    const map = readNumKeys(memory());
    expect(map).toEqual(DEFAULT_NUM_KEYS);
    expect(map).toEqual([
      'upgrade:physical', 'upgrade:magical', 'upgrade:polish', 'gambleCoins:10', 'gambleCoins:100',
      'gambleUnit:small', 'gambleUnit:big', 'gambleUnit:coin', null,
    ]);
  });

  test('round trip', () => {
    const st = memory();
    writeNumKeys(assignNumKey(DEFAULT_NUM_KEYS, 9, 'gambleCoins:10'), st);
    const map = readNumKeys(st);
    expect(map[8]).toBe('gambleCoins:10');
    expect(map[3]).toBeNull();
    expect(keyOf(map, 'gambleCoins:10')).toBe(9);
  });

  test('one key per action', () => {
    const map = assignNumKey(DEFAULT_NUM_KEYS, 1, 'gambleUnit:coin');
    expect(map[0]).toBe('gambleUnit:coin');
    expect(map[7]).toBeNull();
    expect(map.slice(1, 7)).toEqual(DEFAULT_NUM_KEYS.slice(1, 7));
    expect(assignNumKey(DEFAULT_NUM_KEYS, 0, 'gambleUnit:coin')).toBe(DEFAULT_NUM_KEYS);
    expect(assignNumKey(DEFAULT_NUM_KEYS, 10, 'gambleUnit:coin')).toBe(DEFAULT_NUM_KEYS);
    expect(assignNumKey(DEFAULT_NUM_KEYS, 2, null)[1]).toBeNull();
  });

  test('clearAction', () => {
    const map = clearAction(DEFAULT_NUM_KEYS, 'upgrade:polish');
    expect(map[2]).toBeNull();
    expect(keyOf(map, 'upgrade:polish')).toBeNull();
  });

  test('bad stored values', () => {
    for (const raw of ['x', '[]', '[1,2]', '{}', 'null']) expect(readNumKeys(memory({ [KEY]: raw }))).toEqual(DEFAULT_NUM_KEYS);
    const raw = JSON.stringify(['nope', 3, 'gambleCoins:10', 'gambleCoins:10', null, 'upgrade:fire', 'gambleUnit:big', 'gambleUnit:coin', 'upgrade:polish']);
    expect(readNumKeys(memory({ [KEY]: raw }))).toEqual([null, null, 'gambleCoins:10', null, null, null, 'gambleUnit:big', 'gambleUnit:coin', 'upgrade:polish']);
  });

  test('blocked storage', () => {
    const blocked = { ...memory(), getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } } as Storage;
    expect(readNumKeys(blocked)).toEqual(DEFAULT_NUM_KEYS);
    expect(() => writeNumKeys(DEFAULT_NUM_KEYS, blocked)).not.toThrow();
  });

  test('codes', () => {
    expect(numKeyOfCode('Digit1')).toBe(1);
    expect(numKeyOfCode('Numpad9')).toBe(9);
    expect(numKeyOfCode('Digit0')).toBeNull();
    expect(numKeyOfCode('Numpad0')).toBeNull();
    expect(numKeyOfCode('KeyA')).toBeNull();
  });

  test('names', () => {
    const data = loadGameData('stage3');
    expect(numKeyName('upgrade:physical', data)).toBe('물딜 강화');
    expect(numKeyName('upgrade:polish', data)).toBe('등급 손질');
    expect(numKeyName('gambleCoins:100', data)).toBe('돈 도박 100냥');
    expect(numKeyName('gambleUnit:small', data)).toBe('보따리');
    expect(numKeyName('gambleUnit:big', data)).toBe('큰 보따리');
    expect(numKeyName('gambleUnit:coin', data)).toBe('엽전 보따리');
  });

  test('actionOf and splitAction', () => {
    expect(actionOf('upgrade', 'magical')).toBe('upgrade:magical');
    expect(actionOf('gambleCoins', '10')).toBe('gambleCoins:10');
    expect(actionOf('gambleUnit', 'big')).toBe('gambleUnit:big');
    expect(actionOf('summon', '')).toBeNull();
    expect(actionOf('upgrade', 'fire')).toBeNull();
    expect(splitAction('gambleCoins:100')).toEqual({ action: 'gambleCoins', arg: '100' });
    expect(splitAction('upgrade:polish')).toEqual({ action: 'upgrade', arg: 'polish' });
  });
});
