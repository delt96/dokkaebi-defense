import type { Command, GameEvent, GameState, RejectReason } from './types';

export type CommandHandler = (state: GameState, cmd: Command, events: GameEvent[]) => RejectReason | null;
type Phase = (state: GameState, events: GameEvent[]) => void;
export type PhaseName = 'tickStatuses' | 'unitAttacks' | 'resolveKills';

export const handlers = new Map<string, CommandHandler>();
export const afterCommandHooks: Phase[] = [];
export const phases = new Map<PhaseName, Phase>();

export function registerCommand(type: Command['type'], handler: CommandHandler): void {
  handlers.set(type, handler);
}

export function registerAfterCommands(hook: Phase): void {
  afterCommandHooks.push(hook);
}

export function registerPhase(name: PhaseName, fn: Phase): void {
  phases.set(name, fn);
}
