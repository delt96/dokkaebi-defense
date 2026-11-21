import type { GameState } from '@dorandi/logic';
import { GRADE_COLOR } from '../layout';
import { helperModel } from './models';
import { el, esc, setHtml } from './dom';

function helperItems(state: GameState): string {
  const items = helperModel(state);
  return items.length
    ? items.map(i => {
      const note = i.short ? `<small class="combine-short">${esc(i.short)}</small>` : i.cost ? `<small class="combine-cost">${esc(i.cost)}</small>` : '';
      return `<li><span class="dot" style="background:${GRADE_COLOR[i.grade]}"></span>${esc(i.name)}${note}<button data-action="combine" data-arg="${esc(i.recipe)}"${i.short ? ` disabled title="${esc(i.short)}"` : ''}>조합</button></li>`;
    }).join('')
    : '<li class="empty">지금 만들 수 있는 것이 없습니다</li>';
}

/** Online the left panel holds the six rows, so the open helper is laid over them. */
export function helperPopHtml(state: GameState): string {
  return `<div class="helper-pop"><button class="panel-title" data-action="toggleHelper">조합 도우미 ▾ <em>${helperModel(state).filter(i => !i.short).length}</em></button>
    <ul class="helper">${helperItems(state)}</ul></div>`;
}

/** The 'reduce effects' switch (stored per browser); in the left panel alone, in the online menu. */
export function fxToggleHtml(reduced: boolean): string {
  return `<button class="fx-toggle" data-action="toggleFx" aria-pressed="${reduced}">효과 줄이기 ${reduced ? '켬' : '끔'}</button>`;
}

export function renderHelper(state: GameState, expanded: boolean, reducedFx = false): void {
  const items = helperModel(state).filter(i => !i.short);
  const list = expanded ? helperItems(state) : '';
  setHtml(el('left'), `
    <button class="panel-title" data-action="toggleHelper">조합 도우미 ${expanded ? '▾' : '▸'} <em>${items.length}</em></button>
    <ul class="helper">${list}</ul>
    <button class="dex-open" data-action="openDex">도감</button>
    ${fxToggleHtml(reducedFx)}`);
}
