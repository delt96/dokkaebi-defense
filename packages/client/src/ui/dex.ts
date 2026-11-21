import type { GameData } from '@dorandi/logic';
import { GRADE_COLOR } from '../layout';
import { dexEntries, dexShows, recipeTree, summonOddsText, type DexStep, type RecipeNode } from './models';
import { esc } from './dom';
import { withRo } from './josa';

/**
 * Material links and trees: `back` is the link history (its last step names the back button), `open` the entries whose
 * material tree is shown, `board` the def ids on the player's board that the tree marks with ✓.
 */
export interface DexExtra { back?: readonly DexStep[]; open?: readonly string[]; board?: readonly string[] }

/** `story`: stage 3 lets a normal grade-6 row be picked as the story request's target. */
export function dexHtml(data: GameData, story?: { target: string | null; canSet: boolean }, filter = 'all', query = '', round = 1, extra: DexExtra = {}): string {
  const entries = dexEntries(data);
  const browsable = !!data.balance.extendedCombat;
  const visible = entries.filter(d => dexShows(data, d, filter, query));
  const nameOf = new Map(entries.map(d => [d.id, d.name]));
  const open = new Set(extra.open ?? []);
  const rows = visible.map(d => {
    const recipe = d.recipeIds.length ? d.recipeIds.map(id => link(id, nameOf.get(id) ?? id, d.id)).join(' + ') : d.hidden ? '길들이기' : '소환';
    const notes = d.notes.length ? `<ul class="card-notes">${d.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : '';
    const isOpen = open.has(d.id);
    const toggle = d.recipeIds.length
      ? ` <button class="dex-tree-toggle" data-action="dexTree" data-arg="${esc(d.id)}" aria-expanded="${isOpen}">${isOpen ? '재료 접기 ▴' : '재료 펼치기 ▾'}</button>`
      : '';
    const tree = isOpen ? recipeTree(data, d.id, extra.board ?? []) : null;
    // one row per unit: an open tree sits right under the recipe line (where it was opened), then the skill line
    return `
    <tr data-dex-id="${esc(d.id)}"><td><span class="dot" style="background:${GRADE_COLOR[d.grade]}"></span>${d.grade}</td>
    <td>${esc(d.name)}${story && d.grade === 6 && !d.hidden && d.recipe.length ? targetButton(d.id, story) : ''}</td><td>${recipe}${d.cost ? ` <span class="combine-cost">+ ${esc(d.cost)}</span>` : ''}${toggle}${tree ? treeBox(d.id, tree) : ''}
    <div class="dex-skill">${d.typeText} · 사거리 ${d.range}칸${d.skillText ? ` · ${esc(d.skillText)}` : ''}</div>${notes}</td></tr>`;
  }).join('');
  const grades = [...new Set(entries.map(d => d.grade))].sort((a, b) => a - b);
  const filters = ['all', ...grades.map(String), 'hidden'].map(key => {
    const label = key === 'all' ? '전체' : key === 'hidden' ? '숨은 유닛' : `${key}등급`;
    return `<button data-action="dexFilter" data-arg="${key}" aria-pressed="${key === filter}">${label}</button>`;
  }).join('');
  const last = extra.back?.[extra.back.length - 1];
  const backName = last ? nameOf.get(last.id) : undefined;
  const back = backName ? `<button class="dex-back" data-action="dexBack">← ${esc(withRo(backName))}</button>` : '';
  return `<div class="modal dex-modal${browsable ? ' dex-browser' : ''}"><div class="modal-head">도감${browsable ? ` · ${visible.length}종` : ''} <span class="dex-head-actions">${back}<button data-action="closeModal">닫기</button></span></div>
    <div>${esc(summonOddsText(data, round))}</div>
    ${browsable ? `<form class="dex-search"><input type="search" name="query" aria-label="이름·재료 검색" placeholder="이름·재료 검색" value="${esc(query)}"><button>검색</button></form><div class="dex-filters" role="group" aria-label="도감 분류">${filters}</div><div class="dex-scroll">` : ''}<table class="dex"><thead><tr><th>등급</th><th>이름</th><th>재료</th></tr></thead><tbody>${rows || '<tr><td colspan="3">찾는 유닛이 없습니다.</td></tr>'}</tbody></table>${browsable ? '</div>' : ''}</div>`;
}

/** A material name that jumps to its own entry; `from` is the entry it is shown in, for the back button. */
function link(id: string, name: string, from: string): string {
  return `<button class="dex-link" data-action="dexGo" data-arg="${esc(id)}@${esc(from)}">${esc(name)}</button>`;
}

const MARK: Record<RecipeNode['mark'], string> = {
  have: '<span class="mark have" title="보드에 있음">✓</span>',
  missing: '<span class="mark missing" title="보드에 없음">✗</span>',
  covered: '<span class="mark covered" title="윗재료가 보드에 있어 필요 없음">·</span>',
};

function treeBox(from: string, nodes: RecipeNode[]): string {
  return `<div class="dex-tree-box"><div class="dex-tree-legend">✓ 보드에 있음 · ✗ 없음 · 흐린 줄은 필요 없음</div>${treeList(from, nodes)}</div>`;
}

function treeList(from: string, nodes: RecipeNode[]): string {
  return `<ul class="dex-tree">${nodes.map(n => `<li class="${n.mark}"><div class="node">${MARK[n.mark]}<span class="dot" style="background:${GRADE_COLOR[n.grade]}"></span>${link(n.id, n.name, from)}${n.cost ? `<span class="combine-cost">+ ${esc(n.cost)}</span>` : ''}</div>${n.children.length ? treeList(from, n.children) : ''}</li>`).join('')}</ul>`;
}

function targetButton(id: string, story: { target: string | null; canSet: boolean }): string {
  const on = story.target === id;
  // pressing the current target again clears it
  return `<button class="dex-target${on ? ' on' : ''}" data-action="storyTarget" data-arg="${on ? '' : esc(id)}"${story.canSet ? '' : ' disabled'} title="설화 의뢰 목표">${on ? '목표 ✓' : '목표'}</button>`;
}
