import { step, type Command, type GameEvent, type GameState, type StepResult } from '@dorandi/logic';

export function ticksToRun(elapsedMs: number, carryMs: number, tickMs = 50, maxTicks = 40): { ticks: number; carryMs: number } {
  const total = elapsedMs + carryMs;
  const ticks = Math.floor(total / tickMs);
  if (ticks > maxTicks) return { ticks: maxTicks, carryMs: 0 };
  return { ticks, carryMs: total - ticks * tickMs };
}

type Listener = (events: GameEvent[], rejected: StepResult['rejected']) => void;

export class GameDriver {
  state: GameState;
  paused = false;
  private carry = 0;
  private pending: Command[] = [];
  private listeners: Listener[] = [];

  constructor(state: GameState) {
    this.state = state;
  }

  reset(state: GameState): void {
    this.state = state;
    this.carry = 0;
    this.pending = [];
  }

  queue(cmd: Command): void {
    this.pending.push(cmd);
  }

  onEvents(cb: Listener): void {
    this.listeners.push(cb);
  }

  update(elapsedMs: number): void {
    if (this.paused) { this.carry = 0; return; }
    const { ticks, carryMs } = ticksToRun(elapsedMs, this.carry, this.state.data.balance.tickMs);
    this.carry = carryMs;
    for (let i = 0; i < ticks; i++) {
      const cmds = this.pending;
      this.pending = [];
      const r = step(this.state, cmds);
      if (r.events.length || r.rejected.length) for (const l of this.listeners) l(r.events, r.rejected);
    }
  }
}
