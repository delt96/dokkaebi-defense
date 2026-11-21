import {
  applyFull, applyLane, applyMine, applyTick, canonicalJson, fnv1a, loadGameData, toWire,
  type ClientView, type Command, type FullMsg, type LaneBatch, type LaneMsg, type LobbyMsg, type MineMsg, type NoticeMsg,
  type RejectReason, type ResultMsg, type TickMsg, type UnitView,
} from '@dorandi/logic';
import { dimmedSlots, predictUnits, summonsLeft, type PendingCmd } from './predict';
import type { RoomLike } from './room';
import { lastName, loadSession, saveSession } from './session';

export type NetEvent =
  | { kind: 'lobby'; msg: LobbyMsg } | { kind: 'view'; view: ClientView } | { kind: 'lane'; batches: LaneBatch[] }
  | { kind: 'rejected'; cmd: PendingCmd; reason: RejectReason } | { kind: 'notice'; msg: NoticeMsg }
  | { kind: 'result'; msg: ResultMsg } | { kind: 'left'; code: number } | { kind: 'versionMismatch' };

export type OutgoingCommand = Command | { type: 'support'; target: number } | { type: 'forfeit' };

/** The rule-data version this build would play with; computed the same way as MatchState.dataVersion. */
export function stage2DataVersion(): string {
  return fnv1a(canonicalJson(loadGameData('stage2'), new Set()));
}

/** One connection to a match room: applies server messages to a ClientView and sends seq-numbered commands. */
export class NetClient {
  readonly roomId: string;
  lobby: LobbyMsg | null = null;
  view: ClientView | null = null;
  pending: PendingCmd[] = [];
  private nextSeq = 1;
  private awaitingFull = false;
  private readonly listeners: ((e: NetEvent) => void)[] = [];

  constructor(private readonly room: RoomLike, private readonly dataVersion: string) {
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
    if ((cmd.type === 'combine' || cmd.type === 'sell') && cmd.slot !== undefined && dimmedSlots(this.pending).has(cmd.slot)) return false;
    const wire = toWire(this.withUnitIds(cmd));
    const pending: PendingCmd = { seq: this.nextSeq++, ...wire };
    this.pending.push(pending);
    this.room.send('cmd', pending);
    this.emit({ kind: 'view', view });
    return true;
  }

  ready(v: boolean): void { this.room.send('ready', { ready: v }); }
  start(): void { this.room.send('start', {}); }
  watch(seat: number): void { this.room.send('watch', { seat }); }
  rematch(): void { this.room.send('rematch', {}); }

  async leave(): Promise<void> {
    await this.room.leave(true);
  }

  /** Predicted own units when watching the own seat, else the watched lane's units. */
  units(): (UnitView | null)[] {
    const view = this.view;
    if (!view) return [];
    return view.watching === view.me.seat ? this.ownUnits() : view.lane.units;
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
    if (msg.dataVersion !== this.dataVersion) {
      this.emit({ kind: 'versionMismatch' });
      return;
    }
    const view = applyFull(msg);
    this.view = view;
    this.awaitingFull = false;
    // Unacked commands are dropped (spec 6). Seq never goes back on the same connection: a command
    // sent after the server built this snapshot still reaches it, and a reused seq would be ignored.
    this.pending = [];
    this.nextSeq = Math.max(this.nextSeq, view.mine.lastSeq + 1);
    const name = view.rows.find(r => r.seat === view.me.seat)?.name || loadSession(this.roomId)?.name || lastName() || '';
    saveSession(this.roomId, { key: view.me.key, name });
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
    }
    // anything at or below the server's last processed seq will never get an ack of its own
    this.pending = this.pending.filter(p => p.seq > view.mine.lastSeq);
    this.emit({ kind: 'view', view });
  }
}
