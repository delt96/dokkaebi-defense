import { createGame, loadGameData } from '@dorandi/logic';
import { expect, test, vi } from 'vitest';
import { GameDriver } from '../src/driver';
import { LaneScene } from '../src/LaneScene';
import { noticeBand } from '../src/fx/FxLayer';
import { CENTER_X, NOTICE_SPAN } from '../src/layout';

vi.mock('phaser', () => ({ default: { Scene: class {}, Loader: { File: class {} } } }));

test('noticeBand centres on the whole canvas, or on the narrowed span', () => {
  expect(noticeBand(400, null)).toEqual({ cx: 200, half: 200 });
  expect(noticeBand(400, { x: 72, w: 254 })).toEqual({ cx: 199, half: 127 });
});

test('the narrowed span is stage x 200 to 454, handed to the effects in canvas px', () => {
  expect(NOTICE_SPAN).toEqual({ x: 200, w: 254 });
  const scene = new LaneScene(new GameDriver(createGame(loadGameData(), 1)));
  const setNoticeSpan = vi.fn();
  (scene as unknown as { fx: unknown }).fx = { setNoticeSpan };
  scene.setNoticeSpan(true);
  expect(setNoticeSpan).toHaveBeenLastCalledWith({ x: NOTICE_SPAN.x - CENTER_X, w: 254 });
  expect(setNoticeSpan).toHaveBeenLastCalledWith({ x: 72, w: 254 });
  scene.setNoticeSpan(false);
  expect(setNoticeSpan).toHaveBeenLastCalledWith(null);
});
