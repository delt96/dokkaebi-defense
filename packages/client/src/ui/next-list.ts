import { unitDefFast, type GameState } from '@dorandi/logic';
import { esc } from './dom';
import { typeBadgeHtml } from './badge';
import { unitFaceHtml } from './storage';
import { MAKE_SVG, SHARE_SVG, materialChipsHtml } from './chips';
import type { CombineOption, NextList, NextRow } from './models';

/**
 * `unitId`: the selected unit the combine uses (`result@id`), null for a row it is not in. `chips` draws the material
 * chips on a second line; without them (the 44px online card) the row stays one line and names what is missing in words.
 * `link`: a row short of materials opens the dex. `fullBadge` writes 물딜/마딜 in full (the 상세 window).
 */
export interface RowOpts { unitId: number | null; chips?: boolean; link?: boolean; wPick?: boolean; hover?: 'hov' | 'peer' | null; fullBadge?: boolean }

export function recipeRowHtml(state: GameState, option: CombineOption, opts: RowOpts): string {
  const chips = opts.chips !== false;
  const badge = typeBadgeHtml(state.data, option.result, !opts.fullBadge);
  const face = unitFaceHtml(option.result, option.name, option.grade, true);
  const key = option.key ? `[${option.key}] ` : '';
  const head = (extra: string) => `<span class="recipe-top">${key}${face}<b>${esc(option.name)}</b> ${badge}${extra}</span>`;
  const nameOf = (id: string) => unitDefFast(state.data, id).name;
  const mats = chips ? materialChipsHtml(option.materials, option.cost, nameOf) : '';
  const marks = `${opts.wPick ? ' w-pick' : ''}${opts.hover ? ` ${opts.hover}` : ''}`;
  const recipe = ` data-recipe="${esc(option.result)}"`;
  const arg = `${esc(option.result)}${opts.unitId === null ? '' : `@${opts.unitId}`}`;
  if (option.missing.length) {
    const currency = option.short ?? (option.cost ? `비용 ${option.cost}` : '');
    const missing = `${option.missing.join(', ')} 부족${currency ? ` · ${currency}` : ''}`;
    const extra = chips ? (option.short ? ` · <span class="combine-short">${esc(option.short)}</span>` : '') : ` · ${esc(missing)}`;
    const dex = opts.link ? ` data-action="dexOpen" data-arg="${esc(option.result)}"` : '';
    return `<span class="recipe-row combine-missing${marks}"${recipe}${dex} title="${esc(`${option.name} · ${missing}`)}">${head(extra)}${mats}</span>`;
  }
  // every material is there but not the cost: the button stays, disabled, and says what is missing
  if (option.short) {
    return `<button data-action="combine" data-arg="${arg}" class="recipe-row combine-blocked${marks}"${recipe} disabled title="${esc(option.short)}">${head(` · <span class="combine-short">${esc(option.short)}</span>`)}${mats}</button>`;
  }
  const cost = option.cost && !chips ? ` · <span class="combine-cost">${esc(option.cost)}</span>` : '';
  return `<button data-action="combine" data-arg="${arg}" class="recipe-row${marks}"${recipe}${option.cost ? ` title="비용 ${esc(option.cost)}"` : ''}>${head(cost)}${mats}</button>`;
}

/**
 * `unitId`: the selected unit. `wPick`: the row W picked. `hover`: the row under the mouse (its takers get `peer`).
 * `showAllOne` unfolds the one-short group of the all scope. `online` names Shift+Q, the online scope key.
 */
export interface ListOpts { unitId: number | null; wPick: string | null; hover: string | null; showAllOne: boolean; online?: boolean }

const ONE_FOLDED = 4;

const legendShare = `<span class="next-legend" title="위 조합을 먼저 하면 이 재료가 빕니다"><i class="lg-share">${SHARE_SVG}</i>나눠 씀</span>`;
const legendMake = `<span class="next-legend"><i class="lg-make">${MAKE_SVG}</i>만들 수 있음</span>`;

const groupTitle = (title: string, legend: string, target = false): string =>
  `<div class="next-group${target ? ' target' : ''}"><span class="next-title">${esc(title)}</span>${legend}</div>`;

export function nextListHtml(state: GameState, list: NextList, opts: ListOpts): string {
  const peers = new Set(list.rows.find(r => r.result === opts.hover)?.materials.flatMap(m => m.takenBy ?? []) ?? []);
  const row = (r: NextRow) => recipeRowHtml(state, r, {
    unitId: r.uses ? opts.unitId : null, chips: true, link: true, wPick: r.result === opts.wPick,
    hover: r.result === opts.hover ? 'hov' : peers.has(r.result) ? 'peer' : null,
  });
  const target = list.rows.filter(r => r.group === 'target');
  const ready = list.rows.filter(r => r.group === 'ready');
  const one = list.rows.filter(r => r.group === 'one');
  const hasShare = list.rows.some(r => r.materials.some(m => m.mark === 'share'));
  const hasMake = list.rows.some(r => r.materials.some(m => m.mark === 'make'));
  const noneReady = list.scope === 'all' && list.counts.all === 0;
  const readyTitled = ready.length > 0 && !noneReady;
  const oneTitled = one.length > 0;

  const out: string[] = [];
  if (target.length) {
    const legend = (hasShare && !readyTitled ? legendShare : '') + (hasMake && !oneTitled ? legendMake : '');
    out.push(groupTitle(`목표 · ${list.target?.name ?? ''}`, legend, true), ...target.map(row));
  }
  if (noneReady) out.push('<p class="next-empty">지금 만들 수 있는 조합이 없습니다 · Space로 뽑아 재료를 모으세요</p>');
  else if (readyTitled) out.push(groupTitle('지금 가능', hasShare ? legendShare : ''));
  out.push(...ready.map(row));
  if (oneTitled) {
    const folded = list.scope === 'all' && !opts.showAllOne && one.length > ONE_FOLDED;
    const shown = folded ? one.slice(0, ONE_FOLDED) : one;
    const more = folded ? `<button class="next-more" data-action="nextMore">+${one.length - ONE_FOLDED}개 더</button>` : '';
    out.push(`<div class="next-one">${groupTitle('1개 부족', hasMake ? legendMake : '')}${shown.map(row).join('')}${more}</div>`);
  }
  if (list.scope === 'unit' && list.far.length) out.push(`<p class="next-far">재료 2개 이상 모자람 ${list.far.length}개 · 상세(Tab)</p>`);
  if (list.scope === 'unit' && !list.rows.length && !list.far.length) {
    out.push(`<p class="next-empty">이 유닛이 들어가는 조합이 지금은 없습니다 · ${opts.online ? 'Shift+Q' : 'Q'}로 전체 보기</p>`);
  }
  return `<div class="next-list">${out.join('')}</div>`;
}
