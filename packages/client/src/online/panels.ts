import type { ClientView, GameData } from '@dorandi/logic';
import { el, esc, setHtml } from '../ui/dom';
import { myTurnText, rowsModel, topModel } from './models';
import { spiritModel } from './spirit';
import { SETTINGS_BUTTON } from '../ui/settings';

/** Left panel: a 28px title and six 44px rows, one per seat. */
/** `quests` is the folded J line of the 70-round rules, kept in the title bar. */
export function renderRows(view: ClientView, data: GameData, overlay = ''): void {
  const spirit = spiritModel(view) !== null;
  const turn = myTurnText(view, data);
  const rows = rowsModel(view, data).map(r => {
    if (r.empty) return `<div class="lane-row empty"><div class="line1"><span class="title">${esc(r.title)}</span></div></div>`;
    const seat = view.rows.find(x => x.seat === r.seat)!;
    const pick = spirit && seat.status === 'alive';
    const classes = ['lane-row', r.me ? 'me' : '', r.danger ? 'danger' : '', r.mark ?? '', r.seat === view.watching ? 'watching' : '', pick ? 'pickable' : ''].filter(Boolean).join(' ');
    const mark = r.mark ? `<span class="mask" title="역신">탈</span><i class="bar"><i style="width:${Math.round((r.progress ?? 0) * 100)}%"></i></i>` : '';
    const tag = pick ? 'button' : 'div';
    return `<${tag} class="${classes}" title="${esc(r.title)}"${pick ? ` data-action="watch" data-arg="${r.seat}"` : ''}>
      <div class="line1"><span class="title">${r.seat} ${esc(seat.name)}</span>${r.me ? '<b class="self">나</b>' : ''}<b class="count">${esc(r.count)}</b></div>
      <div class="line2"><span class="status">${esc(r.status)}</span>${mark}</div>
      ${r.me && turn ? `<div class="arrival">${esc(turn)}</div>` : ''}
    </${tag}>`;
  }).join('');
  setHtml(el('left'), `<div class="rows-title">고개 현황</div>${rows}${overlay}`);
}

/** Top bar: two 12px lines; the my-turn notice is appended to the second one. */
export function renderTop(view: ClientView, data: GameData): void {
  const m = topModel(view, data);
  const second = m.myTurn ? `${m.line2} · ${m.myTurn}` : m.line2;
  setHtml(el('top'), `<div class="line">${esc(m.line1)}</div><div class="line second${m.myTurn ? ' turn' : ''}">${esc(second)}</div>${SETTINGS_BUTTON}<button class="menu-btn" data-action="openMenu">메뉴</button>`);
}
