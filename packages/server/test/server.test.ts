import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
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

test('the match runs on its own 10 ms loop: numbered updates arrive about every 100 ms', async () => {
  const a = await colyseus.sdk.create('match', { name: '라' });
  const room = colyseus.getRoomById<MatchRoom>(a.roomId);
  let calls = 0;
  const advance = room.core.advance.bind(room.core);
  room.core.advance = () => { calls++; advance(); };
  const updates: { n: number; at: number }[] = [];
  for (const type of ['lobby', 'full', 'lane', 'mine']) a.onMessage(type, () => {});
  a.onMessage('tick', (m: { n: number }) => updates.push({ n: m.n, at: performance.now() }));
  a.send('ready', { ready: true }); a.send('start', {});
  await new Promise(res => setTimeout(res, 50));
  calls = 0;
  await new Promise(res => setTimeout(res, 1000));

  // A 10 ms loop calls advance() well over 40 times a second; riding the 50 ms patch clock gives about 20.
  expect(calls).toBeGreaterThanOrEqual(40);
  expect(updates.length).toBeGreaterThanOrEqual(8);
  expect(updates.map(u => u.n)).toEqual(updates.map((_, i) => i + 1));
  const gaps = updates.slice(1).map((u, i) => u.at - updates[i]!.at);
  expect(Math.max(...gaps)).toBeLessThanOrEqual(160);
});
