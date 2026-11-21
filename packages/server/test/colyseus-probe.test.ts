import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import { ColyseusTestServer } from '@colyseus/testing';
import { Room, ServerError, defineRoom, defineServer, type Client } from 'colyseus';

const disposed: string[] = [];

interface ProbeOptions {
  max?: number;
  autoDispose?: boolean;
}

class ProbeRoom extends Room {
  leaves: (number | undefined)[] = [];

  onCreate(o: ProbeOptions = {}): void {
    this.maxClients = o.max ?? 12;
    this.autoDispose = o.autoDispose ?? true;
    this.onMessage('lock', () => {
      void this.lock();
    });
  }

  onJoin(_c: Client, o: { fail?: boolean } = {}): void {
    if (o.fail) throw new ServerError(4103, 'roomFull');
  }

  onLeave(_c: Client, code?: number): void {
    this.leaves.push(code);
  }

  onDispose(): void {
    disposed.push(this.roomId);
  }
}

async function waitFor(fn: () => unknown, ms = 2000): Promise<void> {
  const until = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > until) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
}

let colyseus: ColyseusTestServer;

beforeAll(async () => {
  // boot() ignores its port for a Server instance (defineServer returns one) and always uses 2568, so listen here.
  const server = defineServer({ rooms: { probe: defineRoom(ProbeRoom) } });
  await server.listen(2601);
  colyseus = new ColyseusTestServer(server);
});

afterEach(async () => {
  await colyseus.cleanup();
});

afterAll(async () => {
  await colyseus.shutdown();
});

describe('colyseus 0.18 room behaviour this design relies on', () => {
  test('joinById into a locked room is refused', async () => {
    const a = await colyseus.sdk.create('probe', {});
    a.send('lock');
    await waitFor(() => colyseus.getRoomById(a.roomId).locked);
    await expect(colyseus.sdk.joinById(a.roomId, {})).rejects.toBeTruthy();
  });

  test('joinById into a full room (maxClients reached) is refused', async () => {
    const a = await colyseus.sdk.create('probe', { max: 1 });
    await expect(colyseus.sdk.joinById(a.roomId, {})).rejects.toBeTruthy();
  });

  test('joinById works below maxClients even after other clients joined and left', async () => {
    const a = await colyseus.sdk.create('probe', { max: 2, autoDispose: false });
    const b = await colyseus.sdk.joinById(a.roomId, {});
    await b.leave();
    const c = await colyseus.sdk.joinById(a.roomId, {});
    expect(c.roomId).toBe(a.roomId);
  });

  test('autoDispose false keeps an empty room; true disposes it', async () => {
    const keep = await colyseus.sdk.create('probe', { autoDispose: false });
    const keepId = keep.roomId;
    await keep.leave();
    const drop = await colyseus.sdk.create('probe', {});
    const dropId = drop.roomId;
    await drop.leave();
    await waitFor(() => disposed.includes(dropId));
    expect(disposed).not.toContain(keepId);
    expect(colyseus.getRoomById(keepId)).toBeTruthy();
  });

  test('a non-consented drop reaches onLeave with a code other than CONSENTED (4000)', async () => {
    const a = await colyseus.sdk.create('probe', { autoDispose: false });
    const room = colyseus.getRoomById(a.roomId) as ProbeRoom;
    a.reconnection.enabled = false;
    await a.leave(false);
    await waitFor(() => room.leaves.length === 1);
    expect(room.leaves[0]).not.toBe(4000);
    const b = await colyseus.sdk.joinById(a.roomId, {});
    await b.leave(true);
    await waitFor(() => room.leaves.length === 2);
    expect(room.leaves[1]).toBe(4000);
  });

  test('an error thrown in onJoin reaches the SDK client with its code', async () => {
    const a = await colyseus.sdk.create('probe', {});
    await expect(colyseus.sdk.joinById(a.roomId, { fail: true })).rejects.toMatchObject({ code: 4103 });
  });
});
