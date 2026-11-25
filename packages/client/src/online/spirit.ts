import type { ClientView, GameData } from '@dorandi/logic';
import { esc } from '../ui/dom';
import type { OnlineActions } from '../ui/mount';
import type { NetClient } from '../net/NetClient';

/** `sentTo`: the seat this spirit supported in the current round (its token is spent until the next one). */
export interface SpiritModel { title: string; tokens: number; canSend: boolean; reason: string | null; sentTo: number | null }

/** The last support this client sent; the server tells only the receiver, so the sender keeps its own note. */
export interface SentSupport { seat: number; round: number }
let lastSent: SentSupport | null = null;

function noteSupportSent(view: ClientView): void {
  lastSent = { seat: view.watching, round: view.clock.round };
}

/** What the battle screen's spirit buttons send to the server. */
export function onlineActions(net: NetClient): OnlineActions {
  return {
    support: () => { const view = net.view; if (view) { net.send({ type: 'support', target: view.watching }); noteSupportSent(view); } },
    watch: seat => net.watch(seat),
    forfeit: () => { net.send({ type: 'forfeit' }); },
  };
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
export function spiritCardHtml(view: ClientView, data: GameData, sent: SentSupport | null = lastSent): string | null {
  const m = spiritModel(view, sent);
  if (!m) return null;
  const { coins, max, perRound } = data.coop!.support;
  const keep = max <= perRound ? '토큰은 쌓이지 않습니다 · 이번 라운드 안에 보내세요' : `토큰은 ${max}개까지 쌓입니다`;
  const note = m.sentTo !== null ? `${m.sentTo}번에게 ${coins}냥을 보냈습니다 · 다음 라운드에 토큰이 다시 생깁니다`
    : m.canSend ? keep : m.reason;
  return `<div class="card spirit"><span class="spirit-title">${esc(m.title)} · 지원 토큰 ${m.tokens}</span>
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
