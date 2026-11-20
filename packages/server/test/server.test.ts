import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ColyseusTestServer } from '@colyseus/testing';
import { createGameServer } from '../src/server';

let colyseus: ColyseusTestServer;
let tmp: string;

beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'dorandi-dist-'));
  writeFileSync(join(tmp, 'index.html'), '<!doctype html><html><body>dorandi</body></html>');
  // boot() ignores its port for a Server instance (always 2568), so listen here.
  const server = createGameServer({ clientDist: tmp });
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

test('unknown paths serve index.html, matchmaking still works', async () => {
  const res = await fetch('http://localhost:2602/room/abc');
  expect(res.status).toBe(200); expect(await res.text()).toContain('<!doctype html>');
  const a = await colyseus.sdk.create('match', { name: '다' });
  expect(a.roomId).toBeTruthy();
});
