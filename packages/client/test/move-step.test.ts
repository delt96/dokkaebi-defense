import { describe, expect, test } from 'vitest';
import { moveStep } from '../src/ui/models';
import { mockBoardState } from './fixtures/next-board';

// the mock board fills slots 0-15; 20 is an open empty cell
const EMPTY = 20;

describe('moveStep, not moving', () => {
  const s = mockBoardState();
  test('a press on a unit selects it', () => {
    expect(moveStep(s, 9, false, { kind: 'press', slot: 3 })).toEqual({ moving: false, select: 3 });
  });
  test('a short press on the selected unit starts moving', () => {
    expect(moveStep(s, 9, false, { kind: 'again', slot: 9 })).toEqual({ moving: true });
  });
  test('a tap selects what is there, as before', () => {
    expect(moveStep(s, 9, false, { kind: 'tap', slot: EMPTY })).toEqual({ moving: false, select: EMPTY });
  });
  test('M starts moving', () => {
    expect(moveStep(s, 9, false, { kind: 'toggle' })).toEqual({ moving: true });
  });
  test('Esc or a right click drops the selection', () => {
    expect(moveStep(s, 9, false, { kind: 'cancel' })).toEqual({ moving: false, select: null });
  });
});

describe('moveStep, moving', () => {
  test('a tap on an open empty cell moves there', () => {
    expect(moveStep(mockBoardState(), 9, true, { kind: 'tap', slot: EMPTY })).toEqual({ moving: false, move: { from: 9, to: EMPTY } });
  });
  test('a tap on another unit swaps with it', () => {
    expect(moveStep(mockBoardState(), 9, true, { kind: 'tap', slot: 3 })).toEqual({ moving: false, move: { from: 9, to: 3 } });
  });
  test('the unit itself, a closed cell or outside the grid only ends moving', () => {
    const s = mockBoardState();
    s.open[EMPTY] = false;
    expect(moveStep(s, 9, true, { kind: 'tap', slot: 9 })).toEqual({ moving: false });
    expect(moveStep(s, 9, true, { kind: 'tap', slot: EMPTY })).toEqual({ moving: false });
    expect(moveStep(s, 9, true, { kind: 'tap', slot: null })).toEqual({ moving: false });
  });
  test('M and Esc end moving and keep the selection', () => {
    const s = mockBoardState();
    expect(moveStep(s, 9, true, { kind: 'toggle' })).toEqual({ moving: false });
    expect(moveStep(s, 9, true, { kind: 'cancel' })).toEqual({ moving: false });
  });
});

test('with nothing selected there is no moving', () => {
  const s = mockBoardState();
  expect(moveStep(s, null, true, { kind: 'tap', slot: 3 })).toEqual({ moving: false, select: 3 });
  expect(moveStep(s, null, false, { kind: 'press', slot: 3 })).toEqual({ moving: false, select: 3 });
  expect(moveStep(s, null, false, { kind: 'toggle' })).toEqual({ moving: false });
  expect(moveStep(s, null, false, { kind: 'cancel' })).toEqual({ moving: false, select: null });
});
