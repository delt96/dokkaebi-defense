import type { ClientView, Command, GameData, GameEvent, GameState, LaneBatch, LaneEvent, RejectReason, StepResult } from '@dorandi/logic';
import { enemyDistanceAt } from '@dorandi/logic';
import type { Driver } from '../driver';
import type { NetClient } from './NetClient';
import { dimmedSlots, summonsLeft, type PendingCmd } from './predict';
import { viewToGameState } from './viewState';

/** Enemies are drawn this many ticks behind the latest server tick (spec 7). */
const RENDER_LAG_TICKS = 2;
/** Only batches newer than this many ticks before the latest tick are animated (review focus 1). */
const ANIMATE_TICKS = 10;

type Listener = (events: GameEvent[], rejected: StepResult['rejected']) => void;

/**
 * The tick to draw: 2 ticks behind the latest one, moving with the clock, and at most 100 ms
 * (the 2 ticks) past the schedule when the next update is late. Never goes back.
 */
export function renderTickAt(now: number, latestTick: number, receivedAt: number, prev: number, tickMs = 50): number {
  return Math.max(prev, Math.min(latestTick - RENDER_LAG_TICKS + (now - receivedAt) / tickMs, latestTick));
}

function commandOf(cmd: PendingCmd): Command {
  return { type: cmd.type, ...(cmd.args ?? {}) } as Command;
}

/** Drives LaneScene and the panels from the server's view; never runs combat itself. */
export class NetDriver implements Driver {
  state: GameState;
  paused = false;
  failed = false;
  readonly online = true;
  readOnly = false;
  dimmed = new Set<number>();
  laneSeat: number;
  laneEpoch = 0;
  private renderTick: number;
  private latestTick: number;
  private receivedAt: number;
  private view: ClientView;
  private readonly listeners: Listener[] = [];
  /**
   * Lane events waiting for the next frame. Messages keep arriving while a tab is hidden and no
   * frame runs, so they are held here (old ticks dropped) and only the newest 10 ticks get animated.
   */
  private buffered: { tick: number; events: GameEvent[] }[] = [];
  /** The newest tick the lane stream or the clock has reached. */
  private newestTick = 0;

  constructor(private readonly net: NetClient, private readonly data: GameData, private readonly now: () => number = () => performance.now()) {
    const view = net.view;
    if (!view) throw new Error('NetDriver needs a view (start it after the first full)');
    this.view = view;
    this.laneSeat = view.watching;
    this.latestTick = view.clock.tick;
    this.receivedAt = now();
    this.renderTick = renderTickAt(this.receivedAt, this.latestTick, this.receivedAt, 0, data.balance.tickMs);
    this.state = this.build();
    this.refresh();
    net.on(e => {
      switch (e.kind) {
        case 'view': this.onView(e.view); break;
        case 'lane': this.onLane(e.batches); break;
        case 'rejected': this.refresh(); this.emit([], [{ command: commandOf(e.cmd), reason: e.reason as RejectReason }]); break;
        default: break;
      }
    });
  }

  onEvents(cb: Listener): void {
    this.listeners.push(cb);
  }

  queue(cmd: Command): void {
    if (this.readOnly) return;
    // a refused command (spirit, no summons left, slot already waiting) is simply not sent
    if (this.net.send(cmd)) this.refresh();
  }

  update(_elapsedMs: number): void {
    this.renderTick = renderTickAt(this.now(), this.latestTick, this.receivedAt, this.renderTick, this.data.balance.tickMs);
    this.refresh();
    this.flushLane();
  }

  enemyDistance(id: number, d: number): number {
    const e = this.net.view?.lane.enemies.find(x => x.id === id);
    return e ? enemyDistanceAt(e, Math.max(this.renderTick, e.t)) : d;
  }

  private build(): GameState {
    const view = this.net.view ?? this.view;
    const state = viewToGameState(view, this.data, this.net.units(), this.renderTick);
    // the summon button shows what is left after the summons still waiting for an ack
    state.tokens = summonsLeft(state.tokens, this.net.pending);
    return state;
  }

  private refresh(): void {
    const view = this.net.view ?? this.view;
    const spirit = view.rows.find(r => r.seat === view.me.seat)?.status === 'spirit';
    const ownLane = view.watching === view.me.seat;
    this.readOnly = spirit || !ownLane;
    this.dimmed = ownLane ? dimmedSlots(this.net.pending) : new Set();
    const round = this.state.round;
    this.state = this.build();
    if (this.state.round > round && this.state.phase === 'round') this.emit([{ type: 'roundStart', round: this.state.round }], []);
  }

  private onView(view: ClientView): void {
    if (view !== this.view) {
      // a new snapshot (resync, watch switch): draw from it, nothing of the old lane is replayed
      this.view = view;
      this.laneSeat = view.watching;
      this.laneEpoch++;
      this.latestTick = view.clock.tick;
      this.receivedAt = this.now();
      this.renderTick = Math.max(this.renderTick, this.latestTick - RENDER_LAG_TICKS);
      this.buffered = [];
      this.newestTick = this.latestTick;
    } else if (view.clock.tick !== this.latestTick) {
      this.latestTick = view.clock.tick;
      this.receivedAt = this.now();
    }
  }

  private onLane(batches: LaneBatch[]): void {
    const before = this.state.slots;
    this.refresh();
    for (const batch of batches) {
      const events: GameEvent[] = [];
      for (const ev of batch.events) {
        const out = toGameEvent(ev, before);
        if (out) events.push(out);
      }
      if (events.length) this.buffered.push({ tick: batch.tick, events });
      this.newestTick = Math.max(this.newestTick, batch.tick);
    }
    this.dropStale();
  }

  /** Batches at or below latest - 10 are never animated; dropping them keeps the buffer small. */
  private dropStale(): void {
    this.newestTick = Math.max(this.newestTick, this.latestTick);
    const oldest = this.newestTick - ANIMATE_TICKS;
    if (this.buffered.length && this.buffered[0]!.tick <= oldest) this.buffered = this.buffered.filter(b => b.tick > oldest);
  }

  private flushLane(): void {
    this.dropStale();
    if (!this.buffered.length) return;
    const events = this.buffered.flatMap(b => b.events);
    this.buffered = [];
    this.emit(events, []);
  }

  private emit(events: GameEvent[], rejected: StepResult['rejected']): void {
    for (const cb of this.listeners) cb(events, rejected);
  }
}

function toGameEvent(ev: LaneEvent, before: GameState['slots']): GameEvent | null {
  switch (ev.t) {
    case 'spawn': return { type: 'spawn', enemyId: ev.id, defId: ev.defId };
    case 'attack': return { type: 'attack', unitId: ev.unitId, enemyId: ev.id };
    case 'damage': return ev.effect
      ? { type: 'damage', enemyId: ev.id, amount: ev.amount, source: ev.source, effect: ev.effect }
      : { type: 'damage', enemyId: ev.id, amount: ev.amount, source: ev.source };
    case 'kill': return { type: 'kill', enemyId: ev.id };
    case 'speed': return { type: 'speedChange', enemyId: ev.id, d: ev.d, speed: ev.speed };
    case 'summon': return { type: 'summon', unitId: ev.unitId, defId: ev.defId, grade: ev.grade, slot: ev.slot };
    case 'combine': {
      // the lane stream does not name the consumed unit; the one drawn at that slot before is the best guess
      const prior = before[ev.slot]?.id;
      return { type: 'combine', replacedUnitId: prior !== undefined && prior !== ev.unitId ? prior : -1, unitId: ev.unitId, defId: ev.defId, slot: ev.slot };
    }
    default: return null;
  }
}
