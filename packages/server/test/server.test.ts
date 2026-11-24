import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ColyseusTestServer } from '@colyseus/testing';
import type { MatchRoom } from '../src/MatchRoom';
import { createGameServer } from '../src/server';

let colyseus: ColyseusTestServer;
let tmp: string;

beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'dorandi-'));
  // The build sits under a dot folder (like .worktrees/...), which must not hide the SPA fallback.
  const dist = join(tmp, '.cache', 'dist');
  mkdirSync(dist, { recursive: true });
  writeFileSync(join(dist, 'index.html'), '<!doctype html><html><body>dorandi</body></html>');
  // boot() ignores its port for a Server instance (always 2568), so listen here.
  const server = createGameServer({ clientDist: dist });
  await server.listen(2602);
  colyseus = new ColyseusTestServer(server);
});

afterEach(async () => {
  await colyseus.cleanup();
});

afterAll(async () => {
  await colyseus.shutdown();
  rmSync(tmp, { recursive: true, force: true });
});

test('create, joinById, ready and start through the real server', async () => {
  const a = await colyseus.sdk.create('match', { name: '가' });
  const fullA = new Promise(res => a.onMessage('full', res));
  const b = await colyseus.sdk.joinById(a.roomId, { name: '나' });
  a.send('ready', { ready: true }); b.send('ready', { ready: true }); a.send('start', {});
  expect(await fullA).toMatchObject({ me: { seat: 1 } });
});

test('join errors reach the SDK with their codes', async () => {
  const a = await colyseus.sdk.create('match', { name: 'Abc' });
  await expect(colyseus.sdk.joinById(a.roomId, { name: 'aBC' })).rejects.toMatchObject({ code: 4102 });
  await expect(colyseus.sdk.joinById(a.roomId, { name: '' })).rejects.toMatchObject({ code: 4101 });
});

test('unknown paths serve index.html even when the build sits under a dot folder; matchmaking still works', async () => {
  for (const path of ['/', '/room/abc', '/solo']) {
    const res = await fetch(`http://localhost:2602${path}`);
    expect(res.status, path).toBe(200); expect(await res.text()).toContain('<!doctype html>');
  }
  const a = await colyseus.sdk.create('match', { name: '다' });
  expect(a.roomId).toBeTruthy();
});

test('/api/live counts a room while it lives and forgets it once disposed', async () => {
  const live = async () => (await fetch('http://localhost:2602/api/live')).json();
  const a = await colyseus.sdk.create('match', { name: '마' });
  expect(await live()).toEqual({ rooms: 1, players: 1, list: [{ phase: 'lobby', stage: 'stage2', round: 0, players: 1 }] });
  await a.leave();
  await vi.waitFor(async () => expect(await live()).toEqual({ rooms: 0, players: 0, list: [] }));
});

test('the match runs on its own 10 ms loop: numbered updates go out every 100 ms of room time', async () => {
  // Capture the room's timers so the test drives its clock itself: wall time under a busy machine says nothing.
  const realSetInterval = globalThis.setInterval;
  const loops: { fn: () => void; handle: ReturnType<typeof setInterval> }[] = [];
  const spy = vi.spyOn(globalThis, 'setInterval').mockImplementation(((fn: () => void, ms?: number) => {
    const handle = realSetInterval(fn, ms);
    if (ms === 10) loops.push({ fn, handle });
    return handle;
  }) as typeof setInterval);
  let a: Awaited<ReturnType<typeof colyseus.sdk.create>>;
  try {
    a = await colyseus.sdk.create('match', { name: '라' });
  } finally {
    spy.mockRestore();
  }
  // Exactly one 10 ms loop: the 50 ms patch clock is not what drives the match.
  expect(loops).toHaveLength(1);
  const loop = loops[0]!;
  clearInterval(loop.handle);

  const room = colyseus.getRoomById<MatchRoom>(a.roomId);
  let now = 0;
  room.core.deps.now = () => now;
  let calls = 0;
  const advance = room.core.advance.bind(room.core);
  room.core.advance = () => { calls++; advance(); };
  const sent: { n: number; at: number }[] = [];
  const server = room.clients.getById(a.sessionId)!;
  const send = server.send.bind(server);
  server.send = ((type: string, msg: { n: number }, ...rest: unknown[]) => {
    if (type === 'tick') sent.push({ n: msg.n, at: now });
    return (send as (...args: unknown[]) => void)(type, msg, ...rest);
  }) as typeof server.send;

  const received: number[] = [];
  for (const type of ['lobby', 'lane', 'mine']) a.onMessage(type, () => {});
  const full = new Promise(res => a.onMessage('full', res));
  a.onMessage('tick', (m: { n: number }) => received.push(m.n));
  a.send('ready', { ready: true }); a.send('start', {});
  await full;

  // Nothing ticks the match while its loop is stopped.
  await new Promise(res => setTimeout(res, 120));
  expect(calls).toBe(0);
  expect(sent).toHaveLength(0);

  // One second of room time: 100 loop steps, 20 ticks, one numbered update every second tick.
  for (let i = 0; i < 100; i++) { now += 10; loop.fn(); }
  expect(calls).toBe(100);
  expect(sent.map(u => u.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  expect(sent.slice(1).map((u, i) => u.at - sent[i]!.at)).toEqual(Array(9).fill(100));

  // And every one of them reaches the client, in order.
  const until = Date.now() + 2000;
  while (received.length < sent.length && Date.now() < until) await new Promise(res => setTimeout(res, 10));
  expect(received).toEqual(sent.map(u => u.n));
});
