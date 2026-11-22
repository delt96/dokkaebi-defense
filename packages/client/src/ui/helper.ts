import type { GameState } from '@dorandi/logic';
import { GRADE_COLOR } from '../layout';
import { helperModel } from './models';
import { el, esc, setHtml } from './dom';
import { typeBadgeHtml } from './badge';

function helperItems(state: GameState): string {
  const items = helperModel(state);
  return items.length
    ? items.map(i => {
      const pay = i.short ? `<small class="combine-short">${esc(i.short)}</small>` : i.cost ? `<small class="combine-cost">비용 ${esc(i.cost)}</small>` : '';
      return `<li><span class="dot" style="background:${GRADE_COLOR[i.grade]}"></span>${esc(i.name)} ${typeBadgeHtml(state.data, i.recipe, true)}<button data-action="combine" data-arg="${esc(i.recipe)}"${i.short ? ` disabled title="${esc(i.short)}"` : ''}>조합</button>${pay}</li>`;
    }).join('')
    : '<li class="empty">지금 만들 수 있는 것이 없습니다</li>';
}

/** Online the left panel holds the six rows, so the open helper is laid over them. */
export function helperPopHtml(state: GameState): string {
  return `<div class="helper-pop"><button class="panel-title" data-action="toggleHelper">조합 도우미 ${state.data.balance.extendedCombat ? '(Q) ' : ''}▾ <em>${helperModel(state).filter(i => !i.short).length}</em></button>
    <ul class="helper">${helperItems(state)}</ul></div>`;
}

/** The switch is in the settings window (gear at the bottom right); while it is on, the list fills the left panel. */
export function renderHelper(state: GameState, expanded: boolean): void {
  const items = helperModel(state).filter(i => !i.short);
  const head = expanded ? `<div class="panel-title">조합 도우미 ${state.data.balance.extendedCombat ? '(Q) ' : ''}<em>${items.length}</em></div>` : '';
  setHtml(el('left'), `${head}
    <ul class="helper">${expanded ? helperItems(state) : ''}</ul>`);
}
