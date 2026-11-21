import { econView, step, type Command, type EconMine, type GameEvent, type GameState, type StepResult, type TransferEndView } from '@dorandi/logic';

export function ticksToRun(elapsedMs: number, carryMs: number, tickMs = 50, maxTicks = 40): { ticks: number; carryMs: number } {
  const total = elapsedMs + carryMs;
  const ticks = Math.floor(total / tickMs);
  if (ticks > maxTicks) return { ticks: maxTicks, carryMs: 0 };
  return { ticks, carryMs: total - ticks * tickMs };
}

interface QueuedCommand {
  command: Command;
  unitId?: number;
}

type Listener = (events: GameEvent[], rejected: StepResult['rejected']) => void;

/** What LaneScene and the panels drive: the local 1-player game or an online seat. */
export interface Driver {
  state: GameState;
  paused: boolean;
  /** Set by the scene when a frame throws; the UI stops sending input. */
  failed: boolean;
  readonly online: boolean;
  /** Selection only: no drag, sell or other board command (spirit, or another lane on screen). */
  readOnly: boolean;
  /** Slots drawn faded while a combine or sell on them waits for the server. */
  dimmed: Set<number>;
  /**
   * Online only: the seat whose lane is drawn, and a counter that moves with every new snapshot.
   * Unit and enemy ids restart per lane, so the scene drops all its views when either changes.
   */
  readonly laneSeat?: number;
  readonly laneEpoch?: number;
  queue(cmd: Command): void;
  onEvents(cb: Listener): void;
  /** Online only: old unit id → new unit id when the server's board replaced a unit in place. */
  onRemap?(cb: (ids: Map<number, number>) => void): void;
  update(elapsedMs: number): void;
  enemyDistance(id: number, d: number): number;
  /** Online only: the drawn lane's seat is out (a spirit), so the scene greys it. */
  laneEliminated?(): boolean;
  /** Stage 3: the own lane's economy (null without one, or while only watching). */
  econ?(): EconMine | null;
  /** Online stage 3: deliveries this seat took part in that ended, with the server's reason. */
  onTransferEnd?(cb: (ends: TransferEndView[]) => void): void;
}

export class GameDriver implements Driver {
  state: GameState;
  paused = false;
  failed = false;
  readonly online = false;
  readOnly = false;
  dimmed = new Set<number>();
  private carry = 0;
  private previousDistances = new Map<number, number>();

  econ(): EconMine | null {
    const v = econView(this.state);
    return v ? { ...v, transfer: null, team: null } : null;
  }

  enemyDistance(id: number, distance: number): number {
    const previous = this.previousDistances.get(id) ?? distance;
    return previous + (distance - previous) * this.carry / this.state.data.balance.tickMs;
  }
  private pending: QueuedCommand[] = [];
  private listeners: Listener[] = [];

  constructor(state: GameState) {
    this.state = state;
  }

  reset(state: GameState): void {
    this.state = state;
    this.paused = false;
    this.failed = false;
    this.previousDistances.clear();
    this.carry = 0;
    this.pending = [];
  }

  queue(cmd: Command): void {
    if (this.failed || (this.paused && cmd.type !== 'helperOpened')) return;
    const slot = cmd.type === 'move' ? cmd.from : cmd.type === 'sell' || cmd.type === 'combine' ? cmd.slot : undefined;
    this.pending.push({ command: cmd, unitId: slot === undefined ? undefined : this.state.slots[slot]?.id });
  }

  private takeCommands(): Command[] {
    // Resolve a board action after any earlier actions have updated the slots.
    const commands: Command[] = [];
    while (this.pending.length) {
      const { command, unitId } = this.pending[0]!;
      if (unitId !== undefined && commands.length) break;
      this.pending.shift();
      if (unitId !== undefined) {
        const slot = this.state.slots.findIndex(unit => unit?.id === unitId);
        if (slot < 0) continue;
        if (command.type === 'move') commands.push({ ...command, from: slot });
        else if (command.type === 'sell' || command.type === 'combine') commands.push({ ...command, slot });
      } else {
        commands.push(command);
      }
    }
    return commands;
  }

  onEvents(cb: Listener): void {
    this.listeners.push(cb);
  }

  update(elapsedMs: number): void {
    if (this.failed || this.paused) return;
    const { ticks, carryMs } = ticksToRun(elapsedMs, this.carry, this.state.data.balance.tickMs);
    this.carry = carryMs;
    for (let i = 0; i < ticks; i++) {
      const cmds = this.takeCommands();
      this.previousDistances.clear();
      for (const enemy of this.state.enemies) this.previousDistances.set(enemy.id, enemy.d);
      const r = step(this.state, cmds);
      if (r.events.length || r.rejected.length) for (const l of this.listeners) l(r.events, r.rejected);
    }
  }
}
