import { describe, expect, test } from 'vitest';
import { PressConfirm } from '../src/ui/confirm';

describe('press twice to confirm', () => {
  test('the first press arms, a second press of the same key within the window goes through', () => {
    const c = new PressConfirm(2000);
    expect(c.press('sell:1', 0)).toBe(false);
    expect(c.armed('sell:1', 1999)).toBe(true);
    expect(c.press('sell:1', 1999)).toBe(true);
    expect(c.armed('sell:1', 2000)).toBe(false);
  });

  test('a second press after the window arms again instead', () => {
    const c = new PressConfirm(2000);
    c.press('sell:1', 0);
    expect(c.press('sell:1', 2001)).toBe(false);
    expect(c.press('sell:1', 3000)).toBe(true);
  });

  test('another key in between moves the arming', () => {
    const c = new PressConfirm(2000);
    c.press('sell:1', 0);
    expect(c.press('tame:4', 10)).toBe(false);
    expect(c.press('sell:1', 20)).toBe(false);
    c.clear();
    expect(c.armed('sell:1', 30)).toBe(false);
  });
});
