import type { GameState } from '@dorandi/logic';
import type { NextList, NextScope } from './models';
import { nextListHtml } from './next-list';
import { scopeHtml } from './panels';
import { winHeadHtml } from './windows';

/** `unitId`: the selected unit (its rows get Z/X/C and combine with it). `scope` is the list's own; the buttons show it. */
export interface HelperPopOpts { unitId: number | null; scope: NextScope; wPick: string | null; hover: string | null; showAllOne: boolean }

/** Online the left panel holds the six rows: on the board the open helper is laid over them ('pop'), beside it it is the left window ('win'). */
export function helperPopHtml(state: GameState, list: NextList, opts: HelperPopOpts, frame: 'pop' | 'win' = 'pop'): string {
  const listHtml = nextListHtml(state, list, { unitId: opts.unitId, wPick: opts.wPick, hover: opts.hover, showAllOne: opts.showAllOne, online: true });
  const scope = scopeHtml(list, opts.unitId !== null, true);
  const scrollKey = `${opts.scope}:${opts.unitId ?? ''}`;
  if (frame === 'win') {
    return `<section class="win helper-win" role="dialog" aria-labelledby="win-left-title">`
      + winHeadHtml({ side: 'left', titleHtml: '조합 도우미 (Q)', closeLabel: '조합 도우미 닫기 (Q)' })
      + `${scope}<div class="win-body helper" data-scroll-key="${scrollKey}">${listHtml}</div></section>`;
  }
  return `<div class="helper-pop"><button class="panel-title" data-action="toggleHelper">조합 도우미 ${state.data.balance.extendedCombat ? '(Q) ' : ''}▾ <em>${list.counts.all}</em></button>
    ${scope}<div class="helper" data-scroll-key="${scrollKey}">${listHtml}</div></div>`;
}
