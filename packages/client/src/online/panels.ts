import type { ClientView, GameData } from '@dorandi/logic';
import { el, esc, setHtml } from '../ui/dom';
import { rowsModel, topModel } from './models';

/** Left panel: a 28px title and six 44px rows, one per seat. */
export function renderRows(view: ClientView, data: GameData): void {
  const rows = rowsModel(view, data).map(r => {
    if (r.empty) return `<div class="lane-row empty"><div class="line1"><span class="title">${esc(r.title)}</span></div></div>`;
    const classes = ['lane-row', r.me ? 'me' : '', r.danger ? 'danger' : '', r.mark ?? ''].filter(Boolean).join(' ');
    const mark = r.mark ? `<span class="mask" title="역신">탈</span><i class="bar"><i style="width:${Math.round((r.progress ?? 0) * 100)}%"></i></i>` : '';
    return `<div class="${classes}">
      <div class="line1"><span class="title">${esc(r.title)}</span><b class="count">${esc(r.count)}</b></div>
      <div class="line2"><span class="status">${esc(r.status)}</span>${mark}</div>
    </div>`;
  }).join('');
  setHtml(el('left'), `<div class="rows-title">고개 현황</div>${rows}`);
}

/** Top bar: two 12px lines; the my-turn notice is appended to the second one. */
export function renderTop(view: ClientView, data: GameData): void {
  const m = topModel(view, data);
  const second = m.myTurn ? `${m.line2} · ${m.myTurn}` : m.line2;
  setHtml(el('top'), `<div class="line">${esc(m.line1)}</div><div class="line second${m.myTurn ? ' turn' : ''}">${esc(second)}</div>`);
}
