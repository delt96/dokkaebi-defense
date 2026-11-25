import type { GameState } from '@dorandi/logic';
import type { NextList, NextScope } from './models';
import { nextListHtml } from './next-list';
import { scopeHtml } from './panels';

/** `unitId`: the selected unit (its rows get Z/X/C and combine with it). `scope` is the list's own; the buttons show it. */
export interface HelperPopOpts { unitId: number | null; scope: NextScope; wPick: string | null; hover: string | null; showAllOne: boolean }

/** Online the left panel holds the six rows, so the open helper is laid over them. */
export function helperPopHtml(state: GameState, list: NextList, opts: HelperPopOpts): string {
  const listHtml = nextListHtml(state, list, { unitId: opts.unitId, wPick: opts.wPick, hover: opts.hover, showAllOne: opts.showAllOne, online: true });
  return `<div class="helper-pop"><button class="panel-title" data-action="toggleHelper">조합 도우미 ${state.data.balance.extendedCombat ? '(Q) ' : ''}▾ <em>${list.counts.all}</em></button>
    ${scopeHtml(list, opts.unitId !== null, true)}<div class="helper" data-scroll-key="${opts.scope}:${opts.unitId ?? ''}">${listHtml}</div></div>`;
}
