import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { ColyseusTestServer } from '@colyseus/testing';
import { createGameServer } from '../src/server';

let colyseus: ColyseusTestServer;

beforeAll(async () => {
  const server = createGameServer();
  await server.listen(2603);
  colyseus = new ColyseusTestServer(server);
});

afterEach(async () => {
  await colyseus.cleanup();
});

afterAll(async () => {
  await colyseus.shutdown();
});

type SdkRoom = Awaited<ReturnType<ColyseusTestServer['sdk']['create']>>;

const wait = (ms: number) => new Promise(res => setTimeout(res, ms));
const next = <T>(room: SdkRoom, type: string, accepts: (msg: T) => boolean = () => true): Promise<T> =>
  new Promise(res => room.onMessage(type, (msg: T) => { if (accepts(msg)) res(msg); }));
/** Swallows every message type the server streams, so the SDK does not warn about missing handlers. */
function quiet(room: SdkRoom): SdkRoom {
  for (const type of ['lobby', 'full', 'tick', 'lane', 'mine', 'notice', 'result']) room.onMessage(type, () => {});
  return room;
}

async function startedPair(): Promise<{ a: SdkRoom; b: SdkRoom; keyA: string }> {
  const a = await colyseus.sdk.create('match', { name: '가' });
  const fullA = next<{ me: { key: string } }>(a, 'full');
  const b = quiet(await colyseus.sdk.joinById(a.roomId, { name: '나' }));
  quiet(a);
  a.send('ready', { ready: true }); b.send('ready', { ready: true }); a.send('start', {});
  return { a, b, keyA: (await fullA).me.key };
}

test('a rejoin that drops before its snapshot is answered can come back with the same key (final review 1)', async () => {
  const { a, keyA } = await startedPair();
  await a.leave(false);
  const a2 = quiet(await colyseus.sdk.joinById(a.roomId, { rejoinKey: keyA }));
  await a2.leave(false);
  const a3 = await colyseus.sdk.joinById(a.roomId, { rejoinKey: keyA });
  const full = await next<{ me: { seat: number; key: string } }>(a3, 'full');
  expect(full.me.seat).toBe(1);
  expect(full.me.key).not.toBe(keyA);
});

test('a flooded connection is dropped while the remaining player can use the room', async () => {
  const { a, b } = await startedPair();
  const dropped = new Promise<number>(resolve => a.onLeave(resolve));
  for (let i = 0; i < 250; i++) a.send('watch', { seat: 2 });
  expect(await dropped).toBe(4002);
  const full = next<{ me: { seat: number } }>(b, 'full');
  b.send('resync', {});
  expect((await full).me.seat).toBe(2);
});

test('an invite still works after the sole lobby player disconnects unexpectedly', async () => {
  const a = quiet(await colyseus.sdk.create('match', { name: '가' }));
  const lobby = next(a, 'lobby');
  await lobby;
  await a.leave(false);
  const b = await colyseus.sdk.joinById(a.roomId, { name: '가' });
  expect(await next(b, 'lobby')).toMatchObject({ roomId: a.roomId, you: 1, hostSeat: 1 });
});

test('the rematch room still takes later pressers after the first presser left it empty (final review 2)', async () => {
  const { a, b } = await startedPair();
  const resultA = next(a, 'result'); const resultB = next(b, 'result');
  a.send('cmd', { seq: 1, type: 'forfeit' }); b.send('cmd', { seq: 1, type: 'forfeit' });
  await Promise.all([resultA, resultB]);

  const noticeA = next<{ kind: string; roomId: string; hostToken?: string }>(a, 'notice', m => m.kind === 'rematch');
  a.send('rematch', {});
  const ra = await noticeA;
  expect(ra).toMatchObject({ kind: 'rematch', hostToken: expect.any(String) });
  await a.leave(true);
  const a2 = quiet(await colyseus.sdk.joinById(ra.roomId, { name: '가', hostToken: ra.hostToken }));
  await a2.leave(true);
  await wait(100);

  const noticeB = next<{ kind: string; roomId: string }>(b, 'notice', m => m.kind === 'rematch');
  b.send('rematch', {});
  const rb = await noticeB;
  expect(rb).toEqual({ kind: 'rematch', roomId: ra.roomId });
  await b.leave(true);
  const b2 = await colyseus.sdk.joinById(rb.roomId, { name: '나' });
  const lobby = await next<{ roomId: string; you: number }>(b2, 'lobby');
  expect(lobby).toMatchObject({ roomId: ra.roomId, you: 1 });
});
