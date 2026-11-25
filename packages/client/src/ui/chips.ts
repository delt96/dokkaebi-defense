import { GRADE_COLOR } from '../layout';
import { esc } from './dom';
import { withJosa } from './josa';
import type { Material } from './models';
import { iconHtml } from './storage';

type ChipMaterial = Pick<Material, 'id' | 'name' | 'grade'> & Partial<Pick<Material, 'mark' | 'takenBy'>> & { have?: boolean };

// Drawn, not typed: the ⇄ and ▲ glyphs fall back to different fonts (or none) from one machine to the next.
export const SHARE_SVG = '<svg viewBox="0 0 10 10" width="8" height="8" aria-hidden="true" focusable="false"><path d="M1 3h7M6 1l2 2-2 2M9 7H2M4 5L2 7l2 2" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
export const MAKE_SVG = '<svg viewBox="0 0 10 10" width="8" height="8" aria-hidden="true" focusable="false"><polygon points="5,1 9.4,9 0.6,9" fill="currentColor" stroke="#000" stroke-width="1"/></svg>';

const MARK = {
  have: '<i class="mat-mark">✓</i>', lack: '<i class="mat-mark">✗</i>',
  share: `<i class="mat-mark">${SHARE_SVG}</i>`, make: `<i class="mat-mark">${MAKE_SVG}</i>`,
} as const;

/**
 * One material: its face in a grade-coloured frame with the name under it. `link` makes it a dex jump (`id@from`).
 * `nameOf` names the rows in `takenBy` for a shared chip's title.
 */
export function materialChipHtml(m: ChipMaterial, link?: string, nameOf: (id: string) => string = id => id): string {
  const state = m.have === undefined ? '' : m.have ? 'have' : 'lack';
  const mark = state === 'have' && m.mark === 'share' ? 'share' : state === 'lack' && m.mark === 'make' ? 'make' : state;
  const cls = `mat-chip${state ? ` ${state}` : ''}${mark !== state ? ` ${mark}` : ''}${link ? ' dex-link' : ''}`;
  const inner = `<span class="mat-face" style="--g:${GRADE_COLOR[m.grade]}">${iconHtml(m.id, m.name, m.grade)}${mark ? MARK[mark] : ''}</span><small>${esc(m.name)}</small>`;
  let attrs: string;
  if (mark === 'share') {
    const takers = m.takenBy ?? [];
    const by = takers.length ? `${withJosa(takers.map(nameOf).join('·'), '이/가')} 먼저 씀` : '위 조합이 먼저 씀';
    attrs = ` title="${esc(`${m.name}: ${by}`)}" aria-label="${esc(`${m.name}, 위 조합과 나눔`)}" data-taken="${esc(takers.join(' '))}"`;
  } else if (mark === 'make') {
    attrs = ` title="${esc(`${m.name} 없음 · 지금 만들 수 있음`)}" aria-label="${esc(`${m.name}, 지금 만들 수 있음`)}"`;
  } else {
    attrs = ` title="${esc(m.name)}${state === 'lack' ? ' 없음' : ''}"`;
  }
  return link
    ? `<button class="${cls}" data-action="dexGo" data-arg="${esc(link)}"${attrs}>${inner}</button>`
    : `<span class="${cls}"${mark === 'share' || mark === 'make' ? ' role="img"' : ''}${attrs}>${inner}</span>`;
}

/** The materials of one recipe in a row; `tail` is the grade 5-6 cost, written after the chips. */
export function materialChipsHtml(ms: readonly ChipMaterial[], tail?: string, nameOf?: (id: string) => string): string {
  return `<span class="mat-chips">${ms.map(m => materialChipHtml(m, undefined, nameOf)).join('')}${tail ? `<span class="mat-cost">+ ${esc(tail)}</span>` : ''}</span>`;
}
