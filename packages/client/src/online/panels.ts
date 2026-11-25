import type { ClientView, GameData } from '@dorandi/logic';
import { el, esc, setHtml } from '../ui/dom';
import { rowsModel, topModel, type Arrival, type GateCountdown } from './models';
import { spiritModel } from './spirit';
import { SETTINGS_BUTTON } from '../ui/settings';

/** Left panel: a 28px title and six 44px rows, one per seat. */
/** `quests` is the folded J line of the 70-round rules, kept in the title bar. */
export function renderRows(view: ClientView, data: GameData, overlay = '', flashing: ReadonlySet<number> = new Set()): void {
  const spirit = spiritModel(view) !== null;
  const rows = rowsModel(view, data).map(r => {
    if (r.empty) return `<div class="lane-row empty"><div class="line1"><span class="title">${esc(r.title)}</span></div></div>`;
    const seat = view.rows.find(x => x.seat === r.seat)!;
    const pick = spirit && seat.status === 'alive';
    const classes = ['lane-row', r.me ? 'me' : '', r.level !== null && r.level !== 'ok' ? 'danger' : '', r.chip === 'current' ? 'current' : '', r.seat === view.watching ? 'watching' : '', pick ? 'pickable' : '', flashing.has(r.seat) ? 'birth-flash' : ''].filter(Boolean).join(' ');
    const mark = r.chip === 'current' ? `<span class="mask" title="역신">탈</span><i class="bar"><i style="width:${Math.round((r.progress ?? 0) * 100)}%"></i></i>` : '';
    const tag = pick ? 'button' : 'div';
    return `<${tag} class="${classes}" title="${esc(r.title)}"${pick ? ` data-action="watch" data-arg="${r.seat}"` : ''}>
      <div class="line1"><span class="title">${r.seat} ${esc(seat.name)}</span>${r.me ? '<b class="self">나</b>' : ''}<b class="count">${esc(r.count)}</b></div>
      <div class="line2"><span class="status">${esc(r.status)}</span>${mark}</div>
    </${tag}>`;
  }).join('');
  setHtml(el('left'), `<div class="rows-title">고개 현황</div>${rows}${overlay}`);
}

/** Top bar: two 12px lines. */
export function renderTop(view: ClientView, data: GameData): void {
  const m = topModel(view, data);
  const tail = m.mineTail ? ` <i class="tail">· ${esc(m.mineTail)}</i>` : '';
  const line1 = m.mine && m.mineLevel !== null ? esc(m.line1).replace(esc(m.mine), `<b class="mine lv-${m.mineLevel}">${esc(m.mine)}${tail}</b>`) : esc(m.line1);
  setHtml(el('top'), `<div class="line">${line1}</div><div class="line second${m.gateUrgent ? ' urgent' : ''}">${esc(m.line2)}</div>${SETTINGS_BUTTON}<button class="menu-btn" data-action="openMenu">메뉴</button>`);
}

const num = (n: number): string => n.toLocaleString('ko-KR');

/** Design ⑪: the 200×40 box in the top slot. `pulse` restarts with each second because the number is a new element. */
export function countdownHtml(c: GateCountdown, pulse: boolean): string {
  const hp = `${num(c.hp)} / ${num(c.maxHp)}`;
  const share = c.maxHp > 0 ? Math.round(Math.min(1, Math.max(0, c.hp / c.maxHp)) * 100) : 0;
  return `<div class="gate-countdown"><b class="cd-sec${pulse ? ' pulse' : ''}">${c.seconds}초</b>`
    + `<span class="cd-text">역신을 쓰러뜨리세요<em class="cd-where">${esc(c.where ? `${c.where} · ${hp}` : hp)}</em></span>`
    + `<i class="cd-bar"><i style="width:${share}%"></i></i></div>`;
}

/** Design ⑬: the box right of the entrance label; its seconds turn red from 5 s. */
export function arrivalHtml(a: Arrival): string {
  const sec = `${a.seconds}초`;
  const at = a.text.indexOf(sec);
  const head = at < 0 ? a.text : a.text.slice(0, at);
  const rest = at < 0 ? '' : a.text.slice(at + sec.length);
  return `<span class="near">${esc(head)}${at < 0 ? '' : `<b class="near-sec${a.urgent ? ' urgent' : ''}">${sec}</b>${esc(rest)}`}</span>`;
}
