import {
  buildFull, createMatch, loadGameData, normalizeNickname, sameNickname,
  type JoinErrorName, type LobbyMsg, type MatchState, type NoticeMsg,
} from '@dorandi/logic';
import { jumpToTick } from '@dorandi/logic/testing';

const MAX_SEATS = 6;

export interface ClientLink { id: string; send(type: string, msg: unknown): void; close(code?: number): void }
export interface RoomDeps {
  now(): number; random128(): string; randomSeed(): number;
  createRematchRoom(opts: { hostToken: string }): Promise<string>;
  setAutoDispose(v: boolean): void; dispose(): void; dev: boolean;
}
export interface RoomOptions { seed?: number; hostToken?: string; devJumpTick?: number; devNoElimination?: boolean }
export interface JoinOptions { name?: unknown; rejoinKey?: unknown; hostToken?: unknown }

export class JoinError extends Error {
  constructor(public reason: JoinErrorName) {
    super(reason);
    this.name = 'JoinError';
  }
}

interface LobbySeat { seat: number; name: string; ready: boolean; linkId: string }

/** Transport-free room rules: lobby, start, and (Task 12/13) the running match. */
export class RoomCore {
  phase: 'lobby' | 'playing' | 'result' | 'closed' = 'lobby';
  match: MatchState | null = null;
  /** Seat -> lobby entry; frozen as the match roster on start. */
  readonly seats = new Map<number, LobbySeat>();
  /** Connected link id -> link and seat. */
  readonly links = new Map<string, { link: ClientLink; seat: number }>();
  hostSeat: number | null = null;
  names: Record<number, string> = {};
  keys: Record<number, string> = {};

  constructor(readonly roomId: string, readonly deps: RoomDeps, readonly options: RoomOptions = {}) {}

  join(link: ClientLink, opts: JoinOptions): void {
    if (this.phase !== 'lobby') {
      // The rejoin-key path arrives in Task 13; without a key a started room refuses new names.
      if (opts.rejoinKey === undefined || opts.rejoinKey === null) throw new JoinError('alreadyStarted');
      throw new JoinError('badKey');
    }
    const name = normalizeNickname(opts.name);
    if (name === null) throw new JoinError('badName');
    for (const s of this.seats.values()) if (sameNickname(s.name, name)) throw new JoinError('dupName');
    let seat = 0;
    for (let i = 1; i <= MAX_SEATS; i++) if (!this.seats.has(i)) { seat = i; break; }
    if (seat === 0) throw new JoinError('roomFull');

    this.seats.set(seat, { seat, name, ready: false, linkId: link.id });
    this.links.set(link.id, { link, seat });
    const tokenHost = this.options.hostToken !== undefined && opts.hostToken === this.options.hostToken;
    if (this.hostSeat === null || tokenHost) this.hostSeat = seat;
    this.broadcastLobby();
  }

  leave(linkId: string, _consented: boolean): void {
    const entry = this.links.get(linkId);
    if (!entry) return;
    this.links.delete(linkId);
    if (this.phase !== 'lobby') return; // Disconnects during the match arrive in Task 13.
    this.seats.delete(entry.seat);
    if (this.seats.size === 0) {
      this.hostSeat = null;
      this.deps.dispose();
      return;
    }
    if (this.hostSeat === entry.seat) this.hostSeat = Math.min(...this.seats.keys());
    this.broadcastLobby();
  }

  message(linkId: string, type: string, payload: unknown): void {
    const entry = this.links.get(linkId);
    if (!entry) return;
    if (type === 'ready' || type === 'start') {
      if (this.phase !== 'lobby') return this.notice(entry.link, { kind: 'roomError', reason: 'notInLobby' });
      if (type === 'ready') return this.onReady(entry.seat, payload);
      return this.onStart(entry.link, entry.seat);
    }
  }

  /** Server clock driver; the match loop arrives in Task 12. */
  advance(): void {}

  private onReady(seat: number, payload: unknown): void {
    const ready = (payload as { ready?: unknown } | null)?.ready;
    if (typeof ready !== 'boolean') return;
    const s = this.seats.get(seat);
    if (!s || s.ready === ready) return;
    s.ready = ready;
    this.broadcastLobby();
  }

  private onStart(link: ClientLink, seat: number): void {
    if (seat !== this.hostSeat) return this.notice(link, { kind: 'roomError', reason: 'notHost' });
    for (const s of this.seats.values()) if (!s.ready) return this.notice(link, { kind: 'roomError', reason: 'notReady' });
    this.start();
  }

  private start(): void {
    const { deps, options } = this;
    this.phase = 'playing';
    const seed = deps.dev && options.seed !== undefined ? options.seed : deps.randomSeed();
    const ring = [...this.seats.keys()].sort((a, b) => a - b);
    this.match = createMatch(loadGameData('stage2'), seed, ring, { noElimination: deps.dev && options.devNoElimination === true });
    if (deps.dev && options.devJumpTick !== undefined) jumpToTick(this.match, options.devJumpTick);
    deps.setAutoDispose(false);
    for (const seat of ring) {
      this.names[seat] = this.seats.get(seat)!.name;
      this.keys[seat] = deps.random128();
    }
    for (const { link, seat } of this.links.values()) {
      link.send('full', buildFull(this.match, seat, { watching: seat, names: this.names, key: this.keys[seat]!, n: 0 }));
    }
  }

  private notice(link: ClientLink, msg: NoticeMsg): void {
    link.send('notice', msg);
  }

  private broadcastLobby(): void {
    const seats = [...this.seats.values()].sort((a, b) => a.seat - b.seat).map(s => ({ seat: s.seat, name: s.name, ready: s.ready }));
    for (const { link, seat } of this.links.values()) {
      const msg: LobbyMsg = { roomId: this.roomId, you: seat, hostSeat: this.hostSeat, seats };
      link.send('lobby', msg);
    }
  }
}
