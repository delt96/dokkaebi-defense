import type { Command, GameState, UpgradeId } from '../types';
import type { MatchCommand } from './types';
import type { WireCommand } from './wire';

const INVALID: MatchCommand = { type: 'invalid' };
const UPGRADE_IDS: ReadonlySet<string> = new Set<UpgradeId>(['physical', 'magical', 'polish', 'slots']);
const TOP_KEYS: ReadonlySet<string> = new Set(['seq', 'type', 'args']);
const MAX_SEAT = 6;
const MAX_RESULT_LENGTH = 32;

type Args = Record<string, unknown>;

const isPlainObject = (x: unknown): x is Args => typeof x === 'object' && x !== null && !Array.isArray(x);
const isInt = (x: unknown): x is number => typeof x === 'number' && Number.isSafeInteger(x);
const inRange = (x: unknown, lo: number, hi: number): x is number => isInt(x) && x >= lo && x <= hi;
const onlyKeys = (args: Args, allowed: readonly string[]): boolean => Object.keys(args).every(k => allowed.includes(k));
const hasAll = (args: Args, keys: readonly string[]): boolean => keys.every(k => Object.hasOwn(args, k));

type Parser = (args: Args, slotCount: number) => MatchCommand | null;

const noArgs = (type: 'summon' | 'convertToken' | 'helperOpened' | 'forfeit'): Parser =>
  args => (Object.keys(args).length === 0 ? { type } : null);

const PARSERS: Record<string, Parser> = {
  summon: noArgs('summon'),
  convertToken: noArgs('convertToken'),
  helperOpened: noArgs('helperOpened'),
  forfeit: noArgs('forfeit'),
  upgrade: args => {
    const keys = ['id'];
    if (!onlyKeys(args, keys) || !hasAll(args, keys)) return null;
    return typeof args.id === 'string' && UPGRADE_IDS.has(args.id) ? { type: 'upgrade', id: args.id as UpgradeId } : null;
  },
  move: (args, slotCount) => {
    const keys = ['from', 'to', 'unitId', 'toUnitId'];
    if (!onlyKeys(args, keys) || !hasAll(args, keys)) return null;
    const { from, to, unitId, toUnitId } = args;
    if (!inRange(from, 0, slotCount - 1) || !inRange(to, 0, slotCount - 1) || !isInt(unitId)) return null;
    if (toUnitId !== null && !isInt(toUnitId)) return null;
    return { type: 'move', from, to, unitId, toUnitId };
  },
  sell: (args, slotCount) => {
    const keys = ['slot', 'unitId'];
    if (!onlyKeys(args, keys) || !hasAll(args, keys)) return null;
    const { slot, unitId } = args;
    if (!inRange(slot, 0, slotCount - 1) || !isInt(unitId)) return null;
    return { type: 'sell', slot, unitId };
  },
  combine: (args, slotCount) => {
    if (!onlyKeys(args, ['result', 'slot', 'unitId']) || !hasAll(args, ['result'])) return null;
    const { result } = args;
    if (typeof result !== 'string' || result.length < 1 || result.length > MAX_RESULT_LENGTH) return null;
    const hasSlot = Object.hasOwn(args, 'slot');
    if (hasSlot !== Object.hasOwn(args, 'unitId')) return null;
    if (!hasSlot) return { type: 'combine', result };
    const { slot, unitId } = args;
    if (!inRange(slot, 0, slotCount - 1) || !isInt(unitId)) return null;
    return { type: 'combine', result, slot, unitId };
  },
  support: args => {
    const keys = ['target'];
    if (!onlyKeys(args, keys) || !hasAll(args, keys)) return null;
    return inRange(args.target, 1, MAX_SEAT) ? { type: 'support', target: args.target } : null;
  },
};

/**
 * Checks a command sent by a browser. Returns null when there is no usable seq (the message is dropped);
 * any other malformation becomes `{ type: 'invalid' }` so the match rejects it with `badArgs`.
 */
export function parseClientCommand(raw: unknown, slotCount = 24): { seq: number; cmd: MatchCommand } | null {
  if (!isPlainObject(raw)) return null;
  const seq = raw.seq;
  if (!isInt(seq) || seq < 1) return null;
  const invalid = { seq, cmd: INVALID };
  if (!Object.keys(raw).every(k => TOP_KEYS.has(k))) return invalid;
  const type = raw.type;
  if (typeof type !== 'string' || !Object.hasOwn(PARSERS, type)) return invalid;
  const args = raw.args === undefined ? {} : raw.args;
  if (!isPlainObject(args)) return invalid;
  const cmd = PARSERS[type]!(args, slotCount);
  return cmd ? { seq, cmd } : invalid;
}

type OutgoingCommand = Command | { type: 'support'; target: number } | { type: 'forfeit' };

/** Turns a local command into its wire form, filling the unit ids the player saw from `lane`. */
export function toWire(cmd: OutgoingCommand, lane?: GameState): Omit<WireCommand, 'seq'> {
  const idAt = (slot: number): number | null => lane?.slots[slot]?.id ?? null;
  switch (cmd.type) {
    case 'move':
      return {
        type: 'move',
        args: {
          from: cmd.from, to: cmd.to,
          unitId: cmd.unitId ?? idAt(cmd.from),
          toUnitId: cmd.toUnitId !== undefined ? cmd.toUnitId : idAt(cmd.to),
        },
      };
    case 'sell':
      return { type: 'sell', args: { slot: cmd.slot, unitId: cmd.unitId ?? idAt(cmd.slot) } };
    case 'combine':
      if (cmd.slot === undefined) return { type: 'combine', args: { result: cmd.result } };
      return { type: 'combine', args: { result: cmd.result, slot: cmd.slot, unitId: cmd.unitId ?? idAt(cmd.slot) } };
    case 'upgrade':
      return { type: 'upgrade', args: { id: cmd.id } };
    case 'support':
      return { type: 'support', args: { target: cmd.target } };
    default:
      return { type: cmd.type };
  }
}
