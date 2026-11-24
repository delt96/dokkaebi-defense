import { randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { CloseCode, Room, ServerError, matchMaker, type Client } from 'colyseus';
import { isDifficulty, JOIN_ERROR_CODES } from '@dorandi/logic';
import { JoinError, RoomCore, isMatchStage, type ClientLink, type JoinOptions, type RoomOptions } from './core/RoomCore';
import { liveRooms } from './live';

/** Keeps only the room options RoomCore understands, with the right types. */
function roomOptions(raw: unknown): RoomOptions {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: RoomOptions = {};
  if (typeof o.seed === 'number' && Number.isInteger(o.seed)) out.seed = o.seed >>> 0;
  if (typeof o.hostToken === 'string') out.hostToken = o.hostToken;
  if (typeof o.devJumpTick === 'number' && Number.isInteger(o.devJumpTick)) out.devJumpTick = o.devJumpTick;
  if (o.devNoElimination === true) out.devNoElimination = true;
  if (typeof o.keepOpenMs === 'number' && Number.isFinite(o.keepOpenMs) && o.keepOpenMs > 0) out.keepOpenMs = o.keepOpenMs;
  if (isMatchStage(o.stage)) out.stage = o.stage;
  if (o.difficulty !== undefined) {
    if (!isDifficulty(o.difficulty)) throw new Error('잘못된 난이도입니다.');
    out.difficulty = o.difficulty;
  }
  return out;
}

/** Thin Colyseus adapter: all rules live in RoomCore. */
export class MatchRoom extends Room {
  core!: RoomCore;

  onCreate(options: unknown): void {
    this.maxClients = 12;
    this.maxMessagesPerSecond = 120;
    this.core = new RoomCore(this.roomId, {
      now: () => performance.now(),
      random128: () => randomBytes(16).toString('hex'),
      randomSeed: () => randomBytes(4).readUInt32LE(0),
      createRematchRoom: async o => (await matchMaker.createRoom('match', o)).roomId,
      setAutoDispose: v => { this.autoDispose = v; },
      dispose: () => { void this.disconnect(); },
      dev: process.env.DORANDI_DEV === '1',
      log: line => console.log(line),
    }, roomOptions(options));
    liveRooms.add(this.core);
    // Its own 10 ms loop: without one, Colyseus only ticks the clock inside the 50 ms patch.
    this.setTimestep(() => this.core.advance(), 10);
    this.onMessage('*', (client: Client, type: string | number, msg: unknown) => {
      this.core.message(client.sessionId, String(type), msg);
    });
  }

  onJoin(client: Client, options?: JoinOptions): void {
    const link: ClientLink = {
      id: client.sessionId,
      send: (t, m) => client.send(t, m),
      close: c => client.leave(c),
    };
    try {
      this.core.join(link, options ?? {});
    } catch (e) {
      if (e instanceof JoinError) throw new ServerError(JOIN_ERROR_CODES[e.reason], e.reason);
      throw e;
    }
  }

  onLeave(client: Client, code?: number): void {
    this.core.leave(client.sessionId, code === CloseCode.CONSENTED);
  }

  onDispose(): void {
    liveRooms.delete(this.core);
  }
}
