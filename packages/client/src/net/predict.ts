import type { UnitView } from '@dorandi/logic';

/** A command sent to the server that has no ack yet (wire form plus seq). */
export interface PendingCmd { seq: number; type: string; args?: Record<string, unknown> }

const slotArg = (cmd: PendingCmd, name: string): number | null => {
  const v = cmd.args?.[name];
  return typeof v === 'number' && Number.isInteger(v) ? v : null;
};

/** The server's board with the pending moves applied in order; a move whose source or target no longer fits is skipped. */
export function predictUnits(server: (UnitView | null)[], open: boolean[], pending: PendingCmd[]): (UnitView | null)[] {
  const units = server.slice();
  for (const cmd of pending) {
    if (cmd.type !== 'move') continue;
    const from = slotArg(cmd, 'from');
    const to = slotArg(cmd, 'to');
    if (from === null || to === null || from === to) continue;
    if (from < 0 || to < 0 || from >= units.length || to >= units.length) continue;
    const unit = units[from];
    if (!unit || unit.id !== cmd.args?.unitId || !open[to]) continue;
    // the server also checks the target's id (null = empty) and rejects a mismatch with staleUnit
    const toUnitId = cmd.args?.toUnitId;
    if (toUnitId !== undefined && (units[to]?.id ?? null) !== toUnitId) continue;
    units[from] = units[to] ?? null;
    units[to] = unit;
  }
  return units;
}

/**
 * The server's storage less the units that pending take-outs and sales will remove (the newest of each kind, as
 * the rules pick). A pending store adds nothing here: its unit stays on the board, faded, until the server answers.
 */
export function predictStorage(server: UnitView[] | undefined, pending: PendingCmd[]): UnitView[] | undefined {
  if (!server) return undefined;
  const units = server.slice();
  for (const cmd of pending) {
    if (cmd.type !== 'retrieve' && cmd.type !== 'sellStored') continue;
    const defId = cmd.args?.defId;
    for (let i = units.length - 1; i >= 0; i--) if (units[i]!.defId === defId) { units.splice(i, 1); break; }
  }
  return units;
}

/** Summons the player can still press: server tokens minus summons not yet acked. */
export function summonsLeft(tokens: number, pending: PendingCmd[]): number {
  const waiting = pending.filter(c => c.type === 'summon').length;
  return Math.max(0, tokens - waiting);
}

/** Slots dimmed while a combine, sell or store on them waits for its ack. */
export function dimmedSlots(pending: PendingCmd[]): Set<number> {
  const out = new Set<number>();
  for (const cmd of pending) {
    if (cmd.type !== 'combine' && cmd.type !== 'sell' && cmd.type !== 'store') continue;
    const slot = slotArg(cmd, 'slot');
    if (slot !== null) out.add(slot);
  }
  return out;
}
