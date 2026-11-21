import {
  unitDefFast, type GameState, type MatchCommand, type MatchInput, type MatchState,
} from '@dorandi/logic';
import { spiritSupport } from '../coop';
import type { Bot } from '../bots';
import { expandTree, remainingNeed } from './targetBot';

const DECIDE_EVERY = 10;

type DriverBot = Bot & { currentTarget?(): string | null };

/** Drives a stage 3 match: bots on living seats, spirit support from the fallen, and jige deliveries when enabled. */
export class EconDriver {
  private readonly bots = new Map<number, DriverBot>();
  private readonly seqs = new Map<number, number>();

  constructor(private readonly match: MatchState, bots: DriverBot[], private readonly opts: { transfer: boolean }) {
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
        for (const cmd of this.bots.get(seat)!.decide(m.lanes[seat]!)) push(seat, cmd);
      } else {
        const cmd = spiritSupport(m, seat);
        if (cmd) push(seat, cmd);
      }
    }
    if (this.opts.transfer && m.econ && m.data.economy?.transfer) {
      for (const [seat, cmd] of this.transfers()) push(seat, cmd);
    }
    return out;
  }

  private target(seat: number): string | null {
    return this.bots.get(seat)?.currentTarget?.() ?? null;
  }

  private transfers(): [number, MatchCommand][] {
    const m = this.match;
    const econ = m.econ!;
    const def = m.data.economy!.transfer!;
    const cmds: [number, MatchCommand][] = [];
    const ok = (s: number) => m.seats[s]!.alive && m.seats[s]!.connected;
    for (const o of econ.offers) {
      const lane = m.lanes[o.to]!;
      const slot = lane.slots.findIndex((u, i) => !u && lane.open[i]);
      if (ok(o.to) && slot >= 0) cmds.push([o.to, { type: 'transferAccept', offerId: o.offerId, slot }]);
    }
    const busy = new Set(econ.offers.flatMap(o => [o.from, o.to]));
    for (const from of m.ring) {
      const lane = m.lanes[from]!;
      if (!ok(from) || !lane.econ?.jige || busy.has(from) || m.round < (econ.readyRound[from] ?? 0)) continue;
      const own = this.target(from);
      const ownTree = own ? expandTree(m.data, own) : new Map<string, number>();
      for (const to of m.ring) {
        if (to === from || !ok(to) || busy.has(to) || m.round < (econ.readyRound[to] ?? 0)) continue;
        const theirs = this.target(to);
        if (!theirs) continue;
        const pick = this.giftFor(lane, m.lanes[to]!, theirs, ownTree, def.maxGrade);
        if (!pick) continue;
        cmds.push([from, { type: 'transferOffer', target: to, slot: pick.slot, unitId: pick.unitId }]);
        busy.add(from); busy.add(to);
        break;
      }
    }
    return cmds;
  }

  /** A unit `from` holds that `to`'s target still lacks and `from`'s own tree does not use. */
  private giftFor(from: GameState, to: GameState, theirs: string, ownTree: Map<string, number>, maxGrade: number) {
    const { missing } = remainingNeed(to, theirs);
    if (!to.slots.some((u, i) => !u && to.open[i])) return null;
    for (let slot = 0; slot < from.slots.length; slot++) {
      const u = from.slots[slot];
      if (!u || u.locked || u.delivered || ownTree.has(u.defId) || !missing.has(u.defId)) continue;
      const def = unitDefFast(from.data, u.defId);
      if (def.hidden || def.grade > maxGrade) continue;
      return { slot, unitId: u.id };
    }
    return null;
  }
}

