import type { GameState } from '@dorandi/logic';
import type { WinPlace } from '../layout';
import { esc } from './dom';
import { rightModel } from './models';

export type LeftWin = 'details' | 'jige' | 'helper';
export type RightWin = 'market' | 'quests' | 'upgrades';
export type SideWin = LeftWin | RightWin;
export type Side = 'left' | 'right';
export interface Sides { left: LeftWin | null; right: RightWin | null; last: Side | null }

export const NO_SIDES: Sides = { left: null, right: null, last: null };

const LEFT_WINS: readonly SideWin[] = ['details', 'jige', 'helper'];

export function sideOf(win: SideWin): Side {
  return LEFT_WINS.includes(win) ? 'left' : 'right';
}

export function openSide(s: Sides, win: SideWin): Sides {
  return sideOf(win) === 'left'
    ? { ...s, left: win as LeftWin, last: 'left' }
    : { ...s, right: win as RightWin, last: 'right' };
}

export function closeSide(s: Sides, side: Side): Sides {
  const next = { ...s, [side]: null } as Sides;
  const other: Side = side === 'left' ? 'right' : 'left';
  return { ...next, last: next[other] ? other : null };
}

export function toggleSide(s: Sides, win: SideWin): Sides {
  const side = sideOf(win);
  return s[side] === win ? closeSide(s, side) : openSide(s, win);
}

export interface LockInput { locking: boolean; paused: boolean; scene: boolean; portrait: boolean; failed: boolean }

export function sidesLocked(i: LockInput): boolean {
  return i.locking || i.paused || i.scene || i.portrait || i.failed;
}

export type EscStep = 'scene' | 'locking' | Side | 'selection';

export function escStep(i: { scene: boolean; locking: boolean; sidesLocked: boolean; sides: Sides }): EscStep {
  if (i.scene) return 'scene';
  if (i.locking) return 'locking';
  // A lock from P pause is not lifted by Esc, so the side windows stay put and Esc goes on to the selection.
  if (!i.sidesLocked) {
    const { left, right, last } = i.sides;
    if (last && i.sides[last]) return last;
    if (right) return 'right';
    if (left) return 'left';
  }
  return 'selection';
}

export function coveredIds(wins: WinPlace, sides: Sides): string[] {
  if (wins !== 'inside') return [];
  const ids: string[] = [];
  // The online helper sits inside #left as helper-pop on the board, so it covers nothing.
  if (sides.left === 'details' || sides.left === 'jige') ids.push('left', 'storage');
  if (sides.right) ids.push('right', 'target-overlay');
  return ids;
}

export function winHeadHtml(o: { side: Side; titleHtml: string; extraHtml?: string; closeLabel: string }): string {
  return `<div class="win-head"><span class="win-title" id="win-${o.side}-title">${o.titleHtml}</span>${o.extraHtml ?? ''}`
    + `<button class="win-close" data-action="closeWin" data-arg="${o.side}" aria-label="${esc(o.closeLabel)}">닫기</button></div>`;
}

export function rightBarHtml(state: GameState, heldCoins: number, coinGlow = false): string {
  const { canSummon } = rightModel(state);
  return `<div class="win-bar"><button class="win-summon" data-action="summon"${canSummon ? '' : ' disabled'}>뚝딱 (Space)</button>`
    + ` <span class="win-money"><span class="nw">불 <b>${esc(state.tokens)}</b> ·</span> <span class="nw">엽전 <b${coinGlow ? ' class="coin-glow"' : ''}>${esc(state.coins - heldCoins)}</b></span>`
    + ` <span class="nw">· 묵 <b>${esc(state.buckwheat)}</b></span></span></div>`;
}
