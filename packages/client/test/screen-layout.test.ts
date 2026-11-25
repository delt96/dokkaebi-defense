import { expect, test } from 'vitest';
import { outerZoom, screenLayout } from '../src/layout';

test.each([
  // w, h, board zoom, place, window zoom, width
  [1920, 953, 2, 'outside', 2, 156],
  [2560, 1305, 3, 'outside', 2, 156],
  [3440, 1305, 3, 'outside', 3, 196],
  [1920, 1080, 3, 'inside', 3, 196],
  [1536, 730, 2, 'inside', 2, 196],
  [1366, 650, 1.5, 'inside', 1.5, 196],
  [1280, 720, 2, 'inside', 2, 196],
  [960, 540, 1.5, 'inside', 1.5, 196],
  [800, 370, 1, 'inside', 1, 196],
])('%ix%i: board %s, windows %s at %s, width %s', (w, h, zoom, wins, winZoom, width) => {
  const l = screenLayout(w, h);
  expect([l.zoom, l.wins, l.winZoom, l.winLeft.w]).toEqual([zoom, wins, winZoom, width]);
});

test('outside boxes sit 4 window px off the board, from under the HUD to the board bottom', () => {
  expect(screenLayout(1920, 953)).toMatchObject({ left: 320, top: 116,
    winLeft: { x: 0, y: 164, w: 156, h: 336 }, winRight: { x: 1608, y: 164, w: 156, h: 336 } });
  expect(screenLayout(2560, 1305).winLeft).toEqual({ x: 0, y: 184, w: 156, h: 504 });
  expect(screenLayout(3440, 1305)).toMatchObject({ winLeft: { x: 160, w: 196 }, winRight: { x: 2692, w: 196 } });
});

test('inside boxes are the pillars at board zoom (online pillars end at 316)', () => {
  expect(screenLayout(1920, 1080)).toMatchObject({ winLeft: { x: 0, y: 72, w: 196, h: 308 }, winRight: { x: 1374, y: 72, w: 182, h: 308 } });
  expect(screenLayout(800, 370)).toMatchObject({ left: 80, top: 5, winLeft: { x: 80, y: 29, w: 196, h: 308 }, winRight: { x: 538, w: 182 } });
  expect(screenLayout(1920, 1080, { online: true }).winLeft.h).toBe(292);
});

test('a connection band shrinks the board below an integer and the windows follow it', () => {
  const l = screenLayout(1920, 1080, { band: 28, online: true });
  expect(l.zoom).toBeCloseTo(1052 / 360);
  expect([l.top, l.left, l.wins, l.winZoom]).toEqual([0, 24, 'inside', l.zoom]);
});

test('outer screens: board zoom x 0.75, down to a 0.25 step, at least 1', () => {
  expect([1, 1.5, 2, 3, 4].map(outerZoom)).toEqual([1, 1, 1.5, 2.25, 3]);
  expect([[800, 370], [960, 540], [1280, 720], [1920, 953], [1920, 1080], [2560, 1305], [2560, 1440]]
    .map(([w, h]) => screenLayout(w!, h!).outerZoom)).toEqual([1, 1, 1.5, 1.5, 2.25, 2.25, 3]);
});
