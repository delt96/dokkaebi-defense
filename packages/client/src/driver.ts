import { step, type Command, type GameEvent, type GameState, type StepResult } from '@dorandi/logic';

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

export class GameDriver {
  state: GameState;
  paused = false;
  private carry = 0;
  private previousDistances = new Map<number, number>();

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
    this.previousDistances.clear();
    this.carry = 0;
    this.pending = [];
  }

  queue(cmd: Command): void {
    if (this.paused) return;
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
    if (this.paused) return;
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
