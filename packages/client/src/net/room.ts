import { Client, type Room } from '@colyseus/sdk';

/** The part of a Colyseus room the net client uses; tests supply a fake. */
export interface RoomLike {
  roomId: string;
  send(type: string, msg?: unknown): void;
  onMessage(type: string, cb: (msg: any) => void): void;
  onLeave(cb: (code: number) => void): void;
  leave(consented?: boolean): Promise<unknown>;
}

/** A failed create/join; `code` is the server's join error code (JOIN_ERROR_CODES) or 0 when there is none. */
export class ConnectError extends Error {
  constructor(message: string, public code: number) {
    super(message);
    this.name = 'ConnectError';
  }
}

export function serverUrl(): string {
  return import.meta.env.VITE_SERVER_URL ?? (import.meta.env.DEV ? 'http://localhost:2567' : location.origin);
}

function wrap(room: Room): RoomLike {
  // Rejoining goes through our own key path (spec 6), never the SDK's automatic reconnection.
  room.reconnection.enabled = false;
  return {
    roomId: room.roomId,
    send: (type, msg) => room.send(type, msg),
    onMessage: (type, cb) => { room.onMessage(type, cb); },
    onLeave: cb => { room.onLeave((code: number) => cb(code)); },
    leave: consented => room.leave(consented),
  };
}

function rethrow(err: unknown): never {
  const code = (err as { code?: unknown } | null)?.code;
  if (err instanceof Error && typeof code === 'number') throw err;
  const message = err instanceof Error ? err.message : String(err);
  throw new ConnectError(message, typeof code === 'number' ? code : 0);
}

export async function connectCreate(name: string): Promise<RoomLike> {
  try {
    return wrap(await new Client(serverUrl()).create('match', { name }));
  } catch (err) {
    return rethrow(err);
  }
}

export async function connectJoin(
  roomId: string, opts: { name?: string; rejoinKey?: string; hostToken?: string },
): Promise<RoomLike> {
  try {
    return wrap(await new Client(serverUrl()).joinById(roomId, opts));
  } catch (err) {
    return rethrow(err);
  }
}
