import type { GameData, GameEvent } from './types';
import { unitDefFast } from './units';

export type BirthVia = 'combine' | 'tame' | 'gamble';

export interface Birth { via: BirthVia; defId: string; unitId: number; grade: number; hidden: boolean }

export function birthOf(data: GameData, event: GameEvent): Birth | null {
  let via: BirthVia;
  if (event.type === 'combine') via = 'combine';
  else if (event.type === 'tame') via = 'tame';
  else if (event.type === 'gambleUnit' && event.defId) via = 'gamble';
  else return null;
  const def = unitDefFast(data, event.defId);
  const hidden = !!def.hidden;
  if (def.grade !== 6 && !hidden) return null;
  return { via, defId: event.defId, unitId: event.unitId, grade: def.grade, hidden };
}
