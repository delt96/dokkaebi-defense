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

const ANIMATED: ReadonlySet<LaneEvent['t']> = new Set(['attack', 'damage', 'kill', 'summon', 'combine']);

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
  private renderTick: number;
  private latestTick: number;
  private receivedAt: number;
  private view: ClientView;
  private readonly listeners: Listener[] = [];

  constructor(private readonly net: NetClient, private readonly data: GameData, private readonly now: () => number = () => performance.now()) {
    const view = net.view;
    if (!view) throw new Error('NetDriver needs a view (start it after the first full)');
    this.view = view;
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
      this.latestTick = view.clock.tick;
      this.receivedAt = this.now();
      this.renderTick = Math.max(this.renderTick, this.latestTick - RENDER_LAG_TICKS);
    } else if (view.clock.tick !== this.latestTick) {
      this.latestTick = view.clock.tick;
      this.receivedAt = this.now();
    }
  }

  private onLane(batches: LaneBatch[]): void {
    const before = this.state.slots;
    this.refresh();
    const newest = Math.max(this.latestTick, ...batches.map(b => b.tick));
    const events: GameEvent[] = [];
    for (const batch of batches) {
      const animate = batch.tick > newest - ANIMATE_TICKS;
      for (const ev of batch.events) {
        if (!animate && ANIMATED.has(ev.t)) continue;
        const out = toGameEvent(ev, before);
        if (out) events.push(out);
      }
    }
    if (events.length) this.emit(events, []);
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
