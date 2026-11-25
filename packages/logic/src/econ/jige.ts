import type { GameData, GameEvent, GameState, JigeSource, RejectReason, UnitDef } from '../types';
import { freshUnit } from '../units';
import { STORAGE_MAX_GRADE } from '../storage';
import { registerCommand } from '../registry';

export function jigeCandidates(data: GameData, defId: string): UnitDef[] {
  const offered = data.units.find(u => u.id === defId);
  const market = data.economy?.market;
  if (!market || !offered || offered.hidden || offered.grade > market.maxSwapGrade) return [];
  return data.units.filter(u => !u.hidden && u.grade === offered.grade && u.id !== offered.id);
}

export function swapJige(state: GameState, source: JigeSource, result: string, events: GameEvent[]): RejectReason | null {
  const econ = state.econ;
  if (!econ || !state.data.economy?.market) return 'unknown';
  if (!source || !['board', 'storage'].includes(source.zone) || !Number.isSafeInteger(source.index) || source.index < 0) return 'badArgs';
  const { zone, index, unitId } = source;
  const units = zone === 'board' ? state.slots : state.storage;
  const unit = units?.[index];
  if (!units || !unit || unit.id !== unitId) return 'staleUnit';
  if (zone === 'board' && !state.open[index]) return 'badArgs';
  const target = jigeCandidates(state.data, unit.defId).find(u => u.id === result);
  if (!target || (zone === 'storage' && target.grade > STORAGE_MAX_GRADE)) return 'badArgs';
  if (econ.jige < 1) return 'noJige';
  const replacement = freshUnit(state, result);
  replacement.cost = unit.cost;
  units[index] = replacement;
  econ.jige--;
  events.push({ type: 'jigeSwap', source: { ...source }, unitId: replacement.id, defId: result });
  return null;
}

registerCommand('jigeSwap', (state, cmd, events) =>
  cmd.type === 'jigeSwap' ? swapJige(state, cmd.source, cmd.result, events) : 'unknown');
