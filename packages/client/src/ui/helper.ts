import type { GameState } from '@dorandi/logic';
import { GRADE_COLOR } from '../layout';
import { helperModel } from './models';
import { el, esc, setHtml } from './dom';

export function renderHelper(state: GameState, expanded: boolean): void {
  const items = helperModel(state);
  const list = expanded
    ? items.length
      ? items.map(i => `<li><span class="dot" style="background:${GRADE_COLOR[i.grade]}"></span>${esc(i.name)}<button data-action="combine" data-arg="${esc(i.recipe)}">조합</button></li>`).join('')
      : '<li class="empty">지금 만들 수 있는 것이 없습니다</li>'
    : '';
  setHtml(el('left'), `
    <button class="panel-title" data-action="toggleHelper">조합 도우미 ${expanded ? '▾' : '▸'} <em>${items.length}</em></button>
    <ul class="helper">${list}</ul>
    <button class="dex-open" data-action="openDex">도감</button>`);
}
