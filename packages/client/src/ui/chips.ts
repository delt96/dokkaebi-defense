import { GRADE_COLOR } from '../layout';
import { esc } from './dom';
import type { Material } from './models';
import { iconHtml } from './storage';

type ChipMaterial = Pick<Material, 'id' | 'name' | 'grade'> & { have?: boolean };

const MARK = { have: '<i class="mat-mark">✓</i>', lack: '<i class="mat-mark">✗</i>' } as const;

/** One material: its face in a grade-coloured frame with the name under it. `link` makes it a dex jump (`id@from`). */
export function materialChipHtml(m: ChipMaterial, link?: string): string {
  const state = m.have === undefined ? '' : m.have ? 'have' : 'lack';
  const cls = `mat-chip${state ? ` ${state}` : ''}${link ? ' dex-link' : ''}`;
  const inner = `<span class="mat-face" style="--g:${GRADE_COLOR[m.grade]}">${iconHtml(m.id, m.name, m.grade)}${state ? MARK[state] : ''}</span><small>${esc(m.name)}</small>`;
  const title = `${esc(m.name)}${state === 'lack' ? ' 없음' : ''}`;
  return link
    ? `<button class="${cls}" data-action="dexGo" data-arg="${esc(link)}" title="${title}">${inner}</button>`
    : `<span class="${cls}" title="${title}">${inner}</span>`;
}

/** The materials of one recipe in a row; `tail` is the grade 5-6 cost, written after the chips. */
export function materialChipsHtml(ms: readonly ChipMaterial[], tail?: string): string {
  return `<span class="mat-chips">${ms.map(m => materialChipHtml(m)).join('')}${tail ? `<span class="mat-cost">+ ${esc(tail)}</span>` : ''}</span>`;
}
