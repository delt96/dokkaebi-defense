import { expect, test } from 'vitest';
import { normalizeNickname, sameNickname } from '../src/index';

test('nickname rules', () => {
  expect(normalizeNickname('  도깨비1 ')).toBe('도깨비1');
  expect(normalizeNickname('가')).toBe('가');
  for (const bad of ['', '   ', '가나다라마바사아자', 'ab cd', '😀', 'ㄱ', 5, null]) expect(normalizeNickname(bad)).toBeNull();
  expect(sameNickname('Abc', 'aBC')).toBe(true);
  expect(sameNickname('가', '나')).toBe(false);
});
