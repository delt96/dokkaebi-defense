import { describe, expect, test } from 'vitest';
import {
  applyFull, applyLane, applyMine, applyTick, buildFull, buildTick, createMatch, diffViews, loadGameData, MatchStreamer, stepMatch,
  type ClientView, type LaneBatch,
} from '@dorandi/logic';
import { CoopDriver } from '../src/coop';

const data = loadGameData('stage2');
const names = { 1: '가', 2: '나', 3: '다' };

describe('view stream', () => {
  test('initial full + tick/lane/mine stream equals a fresh full every 100 ticks; a spirit switches lanes', () => {
    const m = createMatch(data, 8, [1, 2, 3]);
    const drv = new CoopDriver(m, ['normal', 'normal', 'clumsy']);
    const streamer = new MatchStreamer(m);
    const watching: Record<number, number> = { 1: 1, 2: 2, 3: 3 };
    const views: Record<number, ClientView> = {};
    for (const s of [1, 2, 3]) views[s] = applyFull(buildFull(m, s, { watching: s, names, key: 'k', n: 0 }));
    const pending: Record<number, LaneBatch[]> = { 1: [], 2: [], 3: [] };
    let n = 0;
    while (m.tick < 6000 && !m.result) {
      if (m.tick === 2000) drv.queue(3, { type: 'forfeit' });
      const step = stepMatch(m, drv.inputs());
      const out = streamer.afterStep(step);
      for (const s of [1, 2, 3]) {
        const mine = out.mine[s]; if (mine) applyMine(views[s]!, mine);
        pending[s]!.push({ tick: step.tick, events: out.lanes[s] ?? [] });
      }
      if (step.tick % 2 === 1) {
        n++;
        const tick = buildTick(m, names, n);
        for (const s of [1, 2, 3]) {
          expect(applyTick(views[s]!, tick)).toBe('ok');
          expect(applyLane(views[s]!, { n, seat: watching[s]!, batches: pending[watching[s]!]! })).toBe('ok');
        }
        for (const s of [1, 2, 3]) pending[s] = [];
        if (m.tick === 3000) { watching[3] = 1; views[3] = applyFull(buildFull(m, 3, { watching: 1, names, key: 'k', n })); }
        if (m.tick % 100 === 0) for (const s of [1, 2, 3]) {
          const fresh = applyFull(buildFull(m, s, { watching: watching[s]!, names, key: 'k', n }));
          expect(diffViews(views[s]!, fresh), `seat ${s} tick ${m.tick}`).toEqual([]);
        }
      }
    }
    expect(m.seats[3]!.alive).toBe(false);
  }, 120_000);
  test('a skipped update number is a gap and changes nothing', () => {
    const m = createMatch(data, 1, [1]);
    const v = applyFull(buildFull(m, 1, { watching: 1, names, key: 'k', n: 0 }));
    stepMatch(m, []); stepMatch(m, []);
    expect(applyTick(v, buildTick(m, names, 2))).toBe('gap');
    expect(v.n).toBe(0);
    expect(applyLane(v, { n: 2, seat: 1, batches: [] })).toBe('gap');
    expect(applyLane(v, { n: 0, seat: 2, batches: [] })).toBe('ignored');
  });
});
