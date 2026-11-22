import {
  applyFull, applyLane, applyMine, applyTick, canonicalJson, fnv1a, loadGameData, MATCH_STAGES, toWire,
  type ClientView, type Difficulty, type MatchStage, type Command, type FullMsg, type LaneBatch, type LaneMsg, type LobbyMsg, type MineMsg, type NoticeMsg,
  type RejectReason, type ResultMsg, type TickMsg, type UnitView,
} from '@dorandi/logic';
import { dimmedSlots, predictStorage, predictUnits, summonsLeft, type PendingCmd } from './predict';
import type { RoomLike } from './room';
import { lastName, loadSession, saveSession } from './session';

export type NetEvent =
  | { kind: 'lobby'; msg: LobbyMsg } | { kind: 'view'; view: ClientView } | { kind: 'lane'; batches: LaneBatch[] }
  | { kind: 'rejected'; cmd: PendingCmd; reason: RejectReason } | { kind: 'notice'; msg: NoticeMsg }
  | { kind: 'accepted'; cmd: PendingCmd }
  | { kind: 'result'; msg: ResultMsg } | { kind: 'left'; code: number } | { kind: 'versionMismatch' };

export type OutgoingCommand = Command | { type: 'support'; target: number } | { type: 'forfeit' };

const versions = new Map<MatchStage, string>();

/** The rule-data version of one stage in this build; computed the same way as MatchState.dataVersion. */
export function matchDataVersion(stage: MatchStage): string {
  let v = versions.get(stage);
  if (v === undefined) {
    v = fnv1a(canonicalJson(loadGameData(stage), new Set()));
    versions.set(stage, v);
  }
  return v;
}

export function stage2DataVersion(): string {
  return matchDataVersion('stage2');
}

let previousVersion: string | undefined;
function legacyStage3Version(): string {
  if (!previousVersion) {
    const data = loadGameData('stage3');
    delete data.balance.difficulties;
    delete data.balance.defaultDifficulty;
    previousVersion = fnv1a(canonicalJson(data, new Set()));
  }
  return previousVersion;
}

/** Every version this build can play (20 and 60 rounds); a room on any of them is joined with the matching data. */
export function knownDataVersions(): string[] {
  return [...MATCH_STAGES.map(matchDataVersion), legacyStage3Version()];
}

/** Which stage a snapshot's data version belongs to, or null for a build this page cannot play. */
export function stageOfVersion(version: string): MatchStage | null {
  if (version === legacyStage3Version()) return 'stage3';
  return MATCH_STAGES.find(s => matchDataVersion(s) === version) ?? null;
}

/** One connection to a match room: applies server messages to a ClientView and sends seq-numbered commands. */
export class NetClient {
  readonly roomId: string;
  lobby: LobbyMsg | null = null;
  view: ClientView | null = null;
  pending: PendingCmd[] = [];
  /** Set once this client asked to leave, so its own consented close (4000) is not taken for the room closing. */
  leaving = false;
  private nextSeq = 1;
  private awaitingFull = false;
  private keySaved = false;
  private readonly listeners: ((e: NetEvent) => void)[] = [];

  private readonly dataVersions: readonly string[];

  /** `dataVersion`: the version (or versions) this page can play; any other snapshot is a version mismatch. */
  constructor(private readonly room: RoomLike, dataVersion: string | readonly string[]) {
    this.dataVersions = typeof dataVersion === 'string' ? [dataVersion] : dataVersion;
    this.roomId = room.roomId;
    room.onMessage('lobby', (msg: LobbyMsg) => { this.lobby = msg; this.emit({ kind: 'lobby', msg }); });
    room.onMessage('full', (msg: FullMsg) => this.onFull(msg));
    room.onMessage('tick', (msg: TickMsg) => this.onTick(msg));
    room.onMessage('lane', (msg: LaneMsg) => this.onLane(msg));
    room.onMessage('mine', (msg: MineMsg) => this.onMine(msg));
    room.onMessage('notice', (msg: NoticeMsg) => this.emit({ kind: 'notice', msg }));
    room.onMessage('result', (msg: ResultMsg) => {
      if (this.view) this.view.result = msg.result;
      this.emit({ kind: 'result', msg });
    });
    room.onLeave(code => this.emit({ kind: 'left', code }));
  }

  on(cb: (e: NetEvent) => void): void {
    this.listeners.push(cb);
  }

  /** Sends a match command; false when it was not sent (spirit, no summons left, slot already waiting). */
  send(cmd: OutgoingCommand): boolean {
    const view = this.view;
    if (!view) return false;
    if (this.isSpirit() && cmd.type !== 'support' && cmd.type !== 'forfeit') return false;
    if (cmd.type === 'summon' && summonsLeft(view.mine.tokens, this.pending) <= 0) return false;
    if ((cmd.type === 'combine' || cmd.type === 'sell' || cmd.type === 'store') && cmd.slot !== undefined && dimmedSlots(this.pending).has(cmd.slot)) return false;
    const wire = toWire(this.withUnitIds(cmd));
    const pending: PendingCmd = { seq: this.nextSeq++, ...wire };
    this.pending.push(pending);
    this.room.send('cmd', pending);
    this.emit({ kind: 'view', view });
    return true;
  }

  /** `stage`: the round count shown when the button was pressed; the server drops a ready given for an old choice. */
  ready(v: boolean, stage?: MatchStage, difficulty?: Difficulty): void {
    this.room.send('ready', { ready: v, ...(stage && { stage }), ...(difficulty && { difficulty }) });
  }
  setDifficulty(difficulty: Difficulty): void { this.room.send('difficulty', { difficulty }); }
  start(): void { this.room.send('start', {}); }
  /** Host in the lobby: play 20 rounds ('stage2') or the 60-round trial ('stage3'). */
  setStage(stage: MatchStage): void { this.room.send('stage', { stage }); }
  watch(seat: number): void { this.room.send('watch', { seat }); }
  rematch(): void { this.room.send('rematch', {}); }

  async leave(): Promise<void> {
    this.leaving = true;
    await this.room.leave(true);
  }

  /** Predicted own units when watching the own seat, else the watched lane's units. */
  units(): (UnitView | null)[] {
    const view = this.view;
    if (!view) return [];
    return view.watching === view.me.seat ? this.ownUnits() : view.lane.units;
  }

  /** The own storage with pending take-outs and sales removed; undefined before the seat first stores something. */
  storage(): UnitView[] | undefined {
    const view = this.view;
    if (!view || view.watching !== view.me.seat) return undefined;
    return predictStorage(view.mine.storage, this.pending);
  }

  private ownUnits(): (UnitView | null)[] {
    const view = this.view;
    if (!view) return [];
    return predictUnits(view.mine.units, view.mine.open, this.pending);
  }

  private isSpirit(): boolean {
    const view = this.view;
    return !!view && view.rows.find(r => r.seat === view.me.seat)?.status === 'spirit';
  }

  /** Fills the unit ids the player saw, from the board as drawn (pending moves applied). */
  private withUnitIds(cmd: OutgoingCommand): OutgoingCommand {
    const units = this.ownUnits();
    const idAt = (slot: number): number | undefined => units[slot]?.id;
    switch (cmd.type) {
      case 'move':
        return {
          ...cmd,
          unitId: cmd.unitId ?? idAt(cmd.from),
          toUnitId: cmd.toUnitId !== undefined ? cmd.toUnitId : (idAt(cmd.to) ?? null),
        };
      case 'sell':
      case 'store':
        return { ...cmd, unitId: cmd.unitId ?? idAt(cmd.slot) };
      case 'combine':
        return cmd.slot === undefined ? cmd : { ...cmd, unitId: cmd.unitId ?? idAt(cmd.slot) };
      default:
        return cmd;
    }
  }

  private emit(e: NetEvent): void {
    for (const cb of this.listeners) cb(e);
  }

  private resync(): void {
    if (this.awaitingFull) return;
    this.awaitingFull = true;
    this.room.send('resync', {});
  }

  private onFull(msg: FullMsg): void {
    // The server has already issued (or replaced) this key: keep it even on a version mismatch,
    // so the reload that the notice asks for can still take the seat back.
    const name = msg.rows.find(r => r.seat === msg.me.seat)?.name || loadSession(this.roomId)?.name || lastName() || '';
    saveSession(this.roomId, { key: msg.me.key, name });
    // Until the server hears from this connection it still takes the key this tab came with.
    if (!this.keySaved) {
      this.keySaved = true;
      this.room.send('keySaved', {});
    }
    if (!this.dataVersions.includes(msg.dataVersion)) {
      this.emit({ kind: 'versionMismatch' });
      return;
    }
    const view = applyFull(msg);
    if (!view.difficulty && stageOfVersion(view.dataVersion) === 'stage3') view.difficulty = 'normal';
    this.view = view;
    this.awaitingFull = false;
    // Unacked commands are dropped (spec 6). Seq never goes back on the same connection: a command
    // sent after the server built this snapshot still reaches it, and a reused seq would be ignored.
    this.pending = [];
    this.nextSeq = Math.max(this.nextSeq, view.mine.lastSeq + 1);
    this.emit({ kind: 'view', view });
  }

  private onTick(msg: TickMsg): void {
    const view = this.view;
    if (!view || this.awaitingFull) return;
    if (applyTick(view, msg) === 'gap') { this.resync(); return; }
    this.emit({ kind: 'view', view });
  }

  private onLane(msg: LaneMsg): void {
    const view = this.view;
    if (!view || this.awaitingFull) return;
    const fromTick = view.lane.tick;
    const result = applyLane(view, msg);
    if (result === 'gap') { this.resync(); return; }
    if (result === 'ignored') return;
    const batches = msg.batches.filter(b => b.tick > fromTick);
    if (batches.length > 0) this.emit({ kind: 'lane', batches });
    this.emit({ kind: 'view', view });
  }

  private onMine(msg: MineMsg): void {
    const view = this.view;
    if (!view) return;
    const before = view.mine;
    const acks = applyMine(view, msg);
    if (view.mine === before) return;
    for (const ack of acks) {
      const i = this.pending.findIndex(p => p.seq === ack.seq);
      if (i < 0) continue;
      const [cmd] = this.pending.splice(i, 1);
      if (!ack.ok) this.emit({ kind: 'rejected', cmd: cmd!, reason: ack.reason });
      else this.emit({ kind: 'accepted', cmd: cmd! });
    }
    // anything at or below the server's last processed seq will never get an ack of its own
    this.pending = this.pending.filter(p => p.seq > view.mine.lastSeq);
    this.emit({ kind: 'view', view });
  }
}
