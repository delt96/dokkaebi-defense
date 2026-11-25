import type { ClientView, GameData } from '@dorandi/logic';
import { esc } from '../ui/dom';

export interface SpiritModel { title: string; tokens: number; canSend: boolean; reason: string | null }

/** The spirit card under the board: null for a survivor. */
export function spiritModel(view: ClientView): SpiritModel | null {
  const mine = view.rows.find(r => r.seat === view.me.seat);
  if (!mine || mine.status !== 'spirit') return null;
  const target = view.rows.find(r => r.seat === view.watching);
  const tokens = view.mine.supportTokens;
  let reason: string | null = null;
  if (tokens <= 0) reason = '지원 토큰이 없습니다';
  else if (target?.received) reason = '이번 라운드에 이미 받았습니다';
  else if (!target || target.status !== 'alive') reason = '그 고개는 이미 뚫렸습니다';
  return { title: `관전: ${view.watching}번 ${target?.name ?? ''}`, tokens, canSend: reason === null, reason };
}

/** Markup of the spirit card (replaces the unit card in #bottom). */
export function spiritCardHtml(view: ClientView, data: GameData): string | null {
  const m = spiritModel(view);
  if (!m) return null;
  const coins = data.coop!.support.coins;
  return `<div class="card spirit"><span class="spirit-title">${esc(m.title)} · 지원 토큰 ${m.tokens}</span>
    <button data-action="support" ${m.canSend ? '' : 'disabled'}>엽전 ${coins}냥 보내기</button>
    ${m.reason ? `<span class="spirit-reason">${esc(m.reason)}</span>` : ''}</div>`;
}

export const FORFEIT_TEXT = '포기하면 넋이 되어 관전과 지원만 할 수 있습니다. 포기할까요?';

/** Menu and forfeit confirmation windows (shown in #modal); the helper and effects switches are in the settings window. */
export function menuHtml(kind: 'menu' | 'forfeit', spirit: boolean): string {
  if (kind === 'forfeit') {
    return `<div class="modal" role="alertdialog"><div class="modal-head">포기하고 나가기</div>
      <p class="modal-text">${esc(FORFEIT_TEXT)}</p>
      <div class="modal-actions"><button class="danger" data-action="forfeit">포기</button><button data-action="closeModal" data-autofocus>취소</button></div></div>`;
  }
  return `<div class="modal"><div class="modal-head">메뉴 <button data-action="closeModal">닫기</button></div>
    <div class="modal-actions"><button data-action="openDex">도감</button>
    <button data-action="askForfeit" ${spirit ? 'disabled' : ''}>포기하고 나가기</button></div></div>`;
}
