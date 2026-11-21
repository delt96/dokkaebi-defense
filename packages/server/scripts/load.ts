import { performance } from 'node:perf_hooks';
import { createLane, loadGameData, type GameState } from '@dorandi/logic';
import { placeUnitForTest, spawnEnemyForTest } from '@dorandi/logic/testing';
import { RoomCore, type ClientLink, type RoomDeps } from '../src/core/RoomCore';

// test/helpers.ts imports vitest (vi.fn), which cannot load outside a test run, so the same fakes live here.
class FakeLink implements ClientLink {
  sent: { type: string; msg: any }[] = [];
  constructor(public id: string) {}
  send(type: string, msg: unknown): void { this.sent.push({ type, msg }); }
  close(): void {}
  all(type: string): any[] { return this.sent.filter(s => s.type === type).map(s => s.msg); }
}

type FakeDeps = RoomDeps & { clock: { t: number } };
interface Started { core: RoomCore; deps: FakeDeps; links: FakeLink[] }

function started(names: string[], options: { devJumpTick: number; devNoElimination: boolean }): Started {
  let keys = 0;
  const deps: FakeDeps = {
    clock: { t: 0 },
    now: () => deps.clock.t,
    random128: () => `key-${++keys}`,
    randomSeed: () => 42,
    createRematchRoom: async () => 'room-2',
    setAutoDispose: () => {},
    dispose: () => {},
    dev: true,
  };
  const core = new RoomCore('room-load', deps, options);
  const links = names.map((_, i) => new FakeLink(String.fromCharCode(97 + i)));
  links.forEach((l, i) => core.join(l, { name: names[i] }));
  for (const l of links) core.message(l.id, 'ready', { ready: true });
  core.message(links[0]!.id, 'start', {});
  return { core, deps, links };
}

function send(core: RoomCore, id: string, seq: number, type: string): void {
  core.message(id, 'cmd', { seq, type });
}

const SEATS = ['aa', 'bb', 'cc', 'dd', 'ee', 'ff'];
const PERF_TICKS = 1200;
const LATENCY_TICKS = 600;
const ENEMIES_PER_LANE = 70;
const GRADE4 = ['golmu', 'tteongme', 'gawi', 'sokuri', 'byeoru', 'ja', 'chaeban', 'jumadeung'];
const TICK_MS = 50;
const ONE_WAY_MS = 50;

const goal = { p95: 10, max: 25, latencyP95: 170 };

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)]!;
}

/** Six seats, round 1 at tick 700, every board full of grade-4 units. */
function setup(): Started {
  const r = started(SEATS, { devJumpTick: 700, devNoElimination: true });
  const match = r.core.match!;
  const data = loadGameData('stage2');
  const defs = data.units.filter(u => u.grade === 4).map(u => u.id);
  const kinds = GRADE4.filter(id => defs.includes(id)).slice(0, 12);
  if (kinds.length === 0) throw new Error('no grade 4 units in stage2 data');
  for (const seat of match.ring) {
    const lane = match.lanes[seat]!;
    lane.upgrades.slots = 3;
    lane.open.fill(true);
    for (let i = 0; i < lane.slots.length; i++) placeUnitForTest(lane, kinds[i % kinds.length]!, i);
  }
  return r;
}

function refill(core: RoomCore, perimeter: number): void {
  const match = core.match!;
  for (const seat of match.ring) {
    const lane = match.lanes[seat]!;
    const step = perimeter / (ENEMIES_PER_LANE + 1);
    for (let i = lane.enemies.length; i < ENEMIES_PER_LANE; i++) spawnEnemyForTest(lane as GameState, 'japgwi', step * (i + 1), 1e9);
  }
}

function perf(): { times: number[]; ticks: number } {
  const r = setup();
  const data = loadGameData('stage2');
  const perimeter = createLane(data.balance.grid.cols, data.balance.grid.rows).perimeter;
  const times: number[] = [];
  const startTick = r.core.match!.tick;
  for (let i = 0; i < PERF_TICKS; i++) {
    refill(r.core, perimeter);
    r.deps.clock.t += TICK_MS;
    const t0 = performance.now();
    r.core.advance();
    times.push(performance.now() - t0);
  }
  return { times, ticks: r.core.match!.tick - startTick };
}

function latency(): number[] {
  const r = setup();
  const data = loadGameData('stage2');
  const perimeter = createLane(data.balance.grid.cols, data.balance.grid.rows).perimeter;
  const link = r.links[0]!;
  const seenMine = link.all('mine').length;
  let cursor = seenMine;
  const inflight: { seq: number; sentAt: number; arriveAt: number; delivered: boolean }[] = [];
  const out: number[] = [];
  let seq = 0;
  for (let i = 0; i < LATENCY_TICKS; i++) {
    refill(r.core, perimeter);
    const t = r.deps.clock.t + TICK_MS;
    r.deps.clock.t = t;
    // The click lands somewhere inside the previous 50 ms window; the offset walks through all phases.
    if (i % 20 === 0) {
      seq++;
      const sentAt = t - TICK_MS + ((i / 20) * 13) % TICK_MS;
      inflight.push({ seq, sentAt, arriveAt: sentAt + ONE_WAY_MS, delivered: false });
    }
    for (const m of inflight) {
      if (m.delivered || m.arriveAt > t) continue;
      m.delivered = true;
      send(r.core, link.id, m.seq, 'summon');
    }
    r.core.advance();
    const mines = link.all('mine');
    for (; cursor < mines.length; cursor++) {
      const lastSeq: number = mines[cursor].lastSeq;
      for (const m of inflight) {
        if (m.delivered && m.seq <= lastSeq && !('done' in m)) {
          (m as { done?: boolean }).done = true;
          out.push(t + ONE_WAY_MS - m.sentAt);
        }
      }
    }
  }
  return out;
}

const { times, ticks } = perf();
const sorted = [...times].sort((a, b) => a - b);
const p50 = percentile(sorted, 0.5);
const p95 = percentile(sorted, 0.95);
const max = sorted[sorted.length - 1]!;
const lat = latency().sort((a, b) => a - b);
const latP95 = percentile(lat, 0.95);

console.log(`ticks ${ticks}/${PERF_TICKS}`);
console.log(`tick ms  p50 ${p50.toFixed(2)}  p95 ${p95.toFixed(2)}  max ${max.toFixed(2)}`);
console.log(`summon->result  n ${lat.length}  p95 ${latP95.toFixed(1)}ms`);
console.log(`goals  p95 <= ${goal.p95}ms, max <= ${goal.max}ms, ticks ${PERF_TICKS}, summon->result p95 <= ${goal.latencyP95}ms`);

const failures: string[] = [];
if (ticks !== PERF_TICKS) failures.push(`ticks ${ticks}/${PERF_TICKS}`);
if (p95 > goal.p95) failures.push(`p95 ${p95.toFixed(2)}ms > ${goal.p95}ms`);
if (max > goal.max) failures.push(`max ${max.toFixed(2)}ms > ${goal.max}ms`);
if (lat.length < LATENCY_TICKS / 20 || latP95 > goal.latencyP95) failures.push(`summon->result p95 ${latP95.toFixed(1)}ms (n ${lat.length})`);
if (failures.length > 0) {
  console.log(`FAIL: ${failures.join('; ')}`);
  process.exitCode = 1;
} else {
  console.log('OK');
}
