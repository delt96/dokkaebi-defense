import { expect, test, vi } from 'vitest';
import { prizeLook, ringOn } from '../src/LaneScene';

vi.mock('phaser', () => ({ default: { Scene: class {}, Loader: { File: class {} } } }));

test('prizeLook rings grade 5, grade 6 and hidden prizes in their colour and leaves grade 4 alone', () => {
  expect(prizeLook({ grade: 6, hidden: true })).toEqual({ color: 0xc48cff, text: '6등급!' });
  expect(prizeLook({ grade: 6 })).toEqual({ color: 0xffe35a, text: '6등급!' });
  expect(prizeLook({ grade: 5 })).toEqual({ color: 0xff4a3a, text: '5등급!' });
  expect(prizeLook({ grade: 4 })).toBeNull();
});

test('ringOn blinks on 240 ms / off 160 ms three times over 1.2 s', () => {
  expect([0, 239, 240, 399, 400, 639, 640, 799, 800, 1039, 1040, 1199, 1200].map(ms => ringOn(ms, false)))
    .toEqual([true, true, false, false, true, true, false, false, true, true, false, false, false]);
  expect(ringOn(-1, false)).toBe(false);
});

test('the ring never turns on more than three times in any second', () => {
  const ons: number[] = [];
  for (let ms = 1; ms <= 1300; ms++) if (ringOn(ms, false) && !ringOn(ms - 1, false)) ons.push(ms);
  ons.unshift(0);
  for (const start of ons) expect(ons.filter(t => t >= start && t < start + 1000).length).toBeLessThanOrEqual(3);
});

test('with reduced effects the ring stays on for the whole 1.2 s', () => {
  expect(ringOn(800, true)).toBe(true);
  expect(ringOn(250, true)).toBe(true);
  expect(ringOn(1199, true)).toBe(true);
  expect(ringOn(1200, true)).toBe(false);
});
