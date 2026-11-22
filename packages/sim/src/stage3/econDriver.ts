import type { MatchCommand, MatchInput, MatchState } from '@dorandi/logic';
import { spiritSupport } from '../coop';
import type { Bot } from '../bots';
import { surplusGamble } from './econBot';

const DECIDE_EVERY = 10;

type DriverBot = Bot & { currentTarget?(): string | null };

/** Drives a stage 3 match: bots on living seats and spirit support from the fallen. */
export class EconDriver {
  private readonly bots = new Map<number, DriverBot>();
  private readonly seqs = new Map<number, number>();

  constructor(private readonly match: MatchState, bots: DriverBot[], private readonly gamble = false) {
    match.ring.forEach((seat, i) => {
      this.bots.set(seat, bots[i]!);
      this.seqs.set(seat, 0);
    });
  }

  private next(seat: number): number {
    const n = (this.seqs.get(seat) ?? 0) + 1;
    this.seqs.set(seat, n);
    return n;
  }

  inputs(): MatchInput[] {
    const m = this.match;
    const out: MatchInput[] = [];
    if (m.tick % DECIDE_EVERY !== 0) return out;
    const push = (seat: number, cmd: MatchCommand) => out.push({ seat, seq: this.next(seat), cmd });
    for (const seat of m.ring) {
      if (m.seats[seat]!.alive) {
        const lane = m.lanes[seat]!;
        const commands = this.bots.get(seat)!.decide(lane);
        for (const cmd of commands) push(seat, cmd);
        // Recheck on the next decision after purchases, combos and board changes settle.
        if (this.gamble && commands.every(cmd => cmd.type === 'move')) {
          const cmd = surplusGamble(lane);
          if (cmd) push(seat, cmd);
        }
      } else {
        const cmd = spiritSupport(m, seat);
        if (cmd) push(seat, cmd);
      }
    }
    return out;
  }
}
