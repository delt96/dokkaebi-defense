import { unitDefFast, type GameData } from '@dorandi/logic';

/** The 물딜/마딜 badge of a unit, read from its data. `short` is the one-character form for tight spots. */
export function typeBadgeHtml(data: GameData, unitDefId: string, short = false): string {
  const type = unitDefFast(data, unitDefId).damageType;
  const word = type === 'physical' ? '물딜' : '마딜';
  return `<span class="type-badge ${type}" data-type="${type}" title="${word}">${short ? word[0] : word}</span>`;
}
