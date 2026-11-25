import type { ClientView, GameData } from '@dorandi/logic';
import { esc } from '../ui/dom';
import { limitLevel, type LimitLevel } from '../ui/models';
import type { OnlineActions } from '../ui/mount';
import type { NetClient } from '../net/NetClient';

/** `sentTo`: the seat this spirit supported in the current round (its token is spent until the next one). */
export interface SpiritModel { title: string; tokens: number; canSend: boolean; reason: string | null; sentTo: number | null }

/** The last support this client sent; the server tells only the receiver, so the sender keeps its own note. `at`: performance.now(). */
export interface SentSupport { seat: number; round: number; at: number; name: string }
let lastSent: SentSupport | null = null;
let sends = 0;

const TICKS_PER_SECOND = 20;
const SENT_NOTE_MS = 3000;

/** Supports this battle screen sent that the server did not refuse. */
export function sentCount(): number {
  return sends;
}

/** What the battle screen's spirit buttons send to the server. */
export function onlineActions(net: NetClient): OnlineActions {
  sends = 0;
  let before: SentSupport | null = null;
  net.on(e => {
    if (e.kind !== 'rejected' || e.cmd.type !== 'support') return;
    sends = Math.max(0, sends - 1);
    const target = (e.cmd.args as { target?: number } | undefined)?.target;
    if (lastSent && lastSent.seat === target) lastSent = before;
  });
  return {
    support: target => {
      const view = net.view;
      if (!view) return;
      const seat = target ?? view.watching;
      if (!net.send({ type: 'support', target: seat })) return;
      sends++;
      before = lastSent;
      lastSent = { seat, round: view.clock.round, at: performance.now(), name: view.rows.find(r => r.seat === seat)?.name ?? '' };
    },
    watch: seat => net.watch(seat),
    forfeit: () => { net.send({ type: 'forfeit' }); },
  };
}

export interface SurvivorRow { seat: number; name: string; count: number; level: LimitLevel; received: boolean; canSend: boolean }
/** `coins`: what one support gives, the label of each send button. */
export interface SurvivorsModel { head: string; rows: SurvivorRow[]; sentNote: string | null; coins: number }

/** Design ⑳: the living lanes a spirit can support, in seat order like the left rows; null for a survivor. */
export function survivorsModel(view: ClientView, data: GameData, sent: SentSupport | null = lastSent, now = performance.now()): SurvivorsModel | null {
  if (view.rows.find(r => r.seat === view.me.seat)?.status !== 'spirit') return null;
  const { coins, perRound } = data.coop!.support;
  const tokens = view.mine.supportTokens;
  const clock = view.clock;
  const left = Math.max(0, Math.ceil((clock.roundEndTick - clock.tick) / TICKS_PER_SECOND));
  const head = tokens > 0 ? `지원 토큰 ${tokens} · 이번 라운드 안에 보내세요 · 남은 ${left}초` : `다음 라운드에 토큰 ${perRound}개`;
  const rows = view.rows
    .filter(r => r.seat !== view.me.seat && r.status === 'alive')
    .sort((a, b) => a.seat - b.seat)
    .map(r => ({
      seat: r.seat, name: r.name, count: r.count, level: limitLevel(data, r.count, clock.round).level,
      received: r.received, canSend: tokens > 0 && !r.received && clock.phase === 'round',
    }));
  const sentNote = sent && now - sent.at < SENT_NOTE_MS ? `${sent.seat}번 ${sent.name}에게 ${coins}냥을 보냈습니다` : null;
  return { head, rows, sentNote, coins };
}

/** Title 14 + token line 28 + 32 per lane + the sent line 28, kept even while empty so the list does not jump. */
export function survivorsHtml(m: SurvivorsModel): string {
  const rows = m.rows.map(r => {
    const level = r.level === 'ok' ? '' : ` class="lv-${r.level}"`;
    const send = r.received ? '<span class="sv-got">받음</span>'
      : `<button class="sv-send" data-action="supportTo" data-arg="${r.seat}"${r.canSend ? '' : ' disabled'}>${m.coins}냥</button>`;
    return `<div class="sv-row"><button class="sv-watch" data-action="watch" data-arg="${r.seat}">`
      + `<span class="sv-name">${esc(`${r.seat} ${r.name}`)}</span> <b${level}>${r.count}</b></button>${send}</div>`;
  }).join('');
  return `<div class="survivors"><b class="sv-title">살아 있는 고개</b><p class="sv-head">${esc(m.head)}</p>${rows}`
    + `<p class="sv-sent">${m.sentNote ? esc(m.sentNote) : ''}</p></div>`;
}

/** The spirit card under the board: null for a survivor. */
export function spiritModel(view: ClientView, sent: SentSupport | null = lastSent): SpiritModel | null {
  const mine = view.rows.find(r => r.seat === view.me.seat);
  if (!mine || mine.status !== 'spirit') return null;
  const target = view.rows.find(r => r.seat === view.watching);
  const tokens = view.mine.supportTokens;
  const sentTo = tokens <= 0 && sent?.round === view.clock.round ? sent.seat : null;
  let reason: string | null = null;
  if (tokens <= 0) reason = sentTo === null ? '지원 토큰이 없습니다' : null;
  else if (target?.received) reason = '이번 라운드에 이미 받았습니다';
  else if (!target || target.status !== 'alive') reason = '그 고개는 이미 뚫렸습니다';
  return { title: `관전: ${view.watching}번 ${target?.name ?? ''}`, tokens, canSend: tokens > 0 && reason === null, reason, sentTo };
}

/** Markup of the spirit card (replaces the unit card in #bottom). */
export function spiritCardHtml(view: ClientView, data: GameData, sent: SentSupport | null = lastSent, sentTimes = sends): string | null {
  const m = spiritModel(view, sent);
  if (!m) return null;
  const { coins, max, perRound } = data.coop!.support;
  const keep = max <= perRound ? '토큰은 쌓이지 않습니다 · 이번 라운드 안에 보내세요' : `토큰은 ${max}개까지 쌓입니다`;
  const note = m.sentTo !== null ? `${m.sentTo}번에게 ${coins}냥을 보냈습니다 · 다음 라운드에 토큰이 다시 생깁니다`
    : m.canSend ? keep : m.reason;
  const times = sentTimes > 0 ? ` · 이번 판 보낸 엽전 ${sentTimes}회` : '';
  return `<div class="card spirit"><span class="spirit-title">${esc(m.title)} · 지원 토큰 ${m.tokens}${times}</span>
    <button data-action="support" ${m.canSend ? '' : 'disabled'}>엽전 ${coins}냥 보내기</button>
    ${note ? `<span class="spirit-reason">${esc(note)}</span>` : ''}</div>`;
}

export const FORFEIT_TEXT = '포기하면 넋이 되어 관전과 지원만 할 수 있습니다. 포기할까요?';

/** Menu and forfeit confirmation windows (shown in #modal); the helper and effects switches are in the settings window. */
export function menuHtml(kind: 'menu' | 'forfeit', spirit: boolean): string {
  if (kind === 'forfeit') {
    return `<div class="modal" role="alertdialog"><div class="modal-head">포기(넋 되기)</div>
      <p class="modal-text">${esc(FORFEIT_TEXT)}</p>
      <div class="modal-actions"><button class="danger" data-action="forfeit">포기</button><button data-action="closeModal" data-autofocus>취소</button></div></div>`;
  }
  return `<div class="modal"><div class="modal-head">메뉴 <button data-action="closeModal">닫기</button></div>
    <div class="modal-actions"><button data-action="openDex">도감</button>
    <button data-action="askForfeit" ${spirit ? 'disabled' : ''}>포기(넋 되기)</button></div></div>`;
}
