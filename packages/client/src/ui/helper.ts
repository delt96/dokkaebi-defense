import { unitDefFast, type GameState } from '@dorandi/logic';
import { ATTACK_RANGE_HINT, EATS_ITEM_TEXT, attackRangeText, helperModel } from './models';
import { el, esc, setHtml } from './dom';
import { typeBadgeHtml } from './badge';
import { unitFaceHtml } from './storage';
import { materialChipsHtml } from './chips';

function helperItems(state: GameState): string {
  const items = helperModel(state);
  return items.length
    ? items.map(i => {
      const pay = i.short ? `<small class="combine-short">${esc(i.short)}</small>` : i.cost ? `<small class="combine-cost">비용 ${esc(i.cost)}</small>` : '';
      const eats = i.eatsItem ? `<small class="combine-eats">${EATS_ITEM_TEXT}</small>` : '';
      const range = attackRangeText(state.data, unitDefFast(state.data, i.recipe).range);
      return `<li><span class="helper-name" title="사거리 ${range} · ${ATTACK_RANGE_HINT}">${unitFaceHtml(i.recipe, i.name, i.grade)}${esc(i.name)}</span> ${typeBadgeHtml(state.data, i.recipe, true)}<button data-action="combine" data-arg="${esc(i.recipe)}"${i.short ? ` disabled title="${esc(i.short)}"` : ''}>조합</button>${pay}${eats}${materialChipsHtml(i.materials)}</li>`;
    }).join('')
    : '<li class="empty">지금 만들 수 있는 것이 없습니다</li>';
}

/** Online the left panel holds the six rows, so the open helper is laid over them. */
export function helperPopHtml(state: GameState): string {
  return `<div class="helper-pop"><button class="panel-title" data-action="toggleHelper">조합 도우미 ${state.data.balance.extendedCombat ? '(Q) ' : ''}▾ <em>${helperModel(state).filter(i => !i.short).length}</em></button>
    <ul class="helper">${helperItems(state)}</ul></div>`;
}

/**
 * Solo left panel: while the helper is on (settings window or Q) its list sits on top and scrolls; `card` (the selected
 * unit's card) stays under it, or has the whole panel when the helper is off.
 */
export function renderHelper(state: GameState, expanded: boolean, card = ''): void {
  const items = helperModel(state).filter(i => !i.short);
  const list = expanded
    ? `<div class="panel-title">조합 도우미 ${state.data.balance.extendedCombat ? '(Q) ' : ''}<em>${items.length}</em></div>
    <ul class="helper">${helperItems(state)}</ul>`
    : '';
  setHtml(el('left'), `${list}${card}`);
}
