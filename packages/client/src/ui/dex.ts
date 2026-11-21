import type { GameData, GameState } from '@dorandi/logic';
import { GRADE_COLOR } from '../layout';
import { MINE_KEYS, MINE_LABEL, branchKey, dexEntries, dexShows, recipeTree, roleList, summonOddsText, treeSize, type DexStep, type RecipeNode } from './models';
import { esc } from './dom';
import { ROLE_LABEL, ROLE_ORDER, roleText } from './dex-roles';
import { withRo } from './josa';

/**
 * Material links and trees: `back` is the link history (its last step names the back button), `open` the entries whose
 * material tree is shown, `board` the def ids on the player's board that the tree marks with ✓, `unfold` the branches
 * under a ✓ material that are unfolded (branchKey; the rest stay folded).
 */
export interface DexExtra { recent?: readonly string[]; back?: readonly DexStep[]; open?: readonly string[]; board?: readonly string[]; unfold?: readonly string[]; /** 상세검색 is open */ adv?: boolean; /** the game, for the 내 판 기준 chips */ state?: GameState }

/** `story`: stage 3 lets a normal grade-6 row be picked as the story request's target. */
export function dexHtml(data: GameData, story?: { target: string | null; canSet: boolean }, filter = 'all', query = '', round = 1, extra: DexExtra = {}, more: { kind?: string; role?: string; skill?: string; mine?: readonly string[] } = {}): string {
  const entries = dexEntries(data);
  const browsable = !!data.balance.extendedCombat;
  const visible = entries.filter(d => dexShows(data, d, filter, query, { ...more, state: extra.state }));
  const kind = more.kind ?? 'all';
  const role = more.role ?? 'all';
  const skill = more.skill ?? '';
  const mine = extra.state ? more.mine ?? [] : [];
  const adv = extra.adv === true;
  const picked = new Set(roleList(role));
  const narrowed = (browsable && (filter !== 'all' || query !== '')) || kind !== 'all' || role !== 'all' || skill !== '' || mine.length > 0;
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
    <td><div class="dex-name">${esc(d.name)}${story && d.grade === 6 && !d.hidden && d.recipe.length ? targetButton(d.id, story) : ''}</div>${d.roles.length ? `<div class="dex-roles">${d.roles.map(t => `<span class="role-tag role-${t.role}">${roleText(t)}</span>`).join('')}</div>` : ''}</td><td>${recipe}${d.cost ? ` <span class="combine-cost">+ ${esc(d.cost)}</span>` : ''}${toggle}${tree ? treeBox(d.id, tree, new Set(extra.unfold ?? [])) : ''}
    <div class="dex-skill">${d.typeText} · 사거리 ${d.range}칸${d.skillText ? ` · ${esc(d.skillText)}` : ''}</div>${notes}</td></tr>`;
  }).join('');
  const grades = [...new Set(entries.map(d => d.grade))].sort((a, b) => a - b);
  const filters = ['all', ...grades.map(String), 'hidden'].map(key => {
    const label = key === 'all' ? '전체' : key === 'hidden' ? '숨은 유닛' : `${key}등급`;
    return `<button data-action="dexFilter" data-arg="${key}" aria-pressed="${key === filter}">${label}</button>`;
  }).join('');
  const chips = (action: string, current: string, items: [string, string][]) =>
    items.map(([key, label]) => `<button data-action="${action}" data-arg="${key}" aria-pressed="${key === current}">${label}</button>`).join('');
  const kindRow = chips('dexKind', kind, [['all', '전체'], ['physical', '물딜'], ['magical', '마딜']]);
  const roleRow = [['all', '전체'], ...ROLE_ORDER.map((r): [string, string] => [r, ROLE_LABEL[r]])]
    .map(([key, label]) => `<button data-action="dexRole" data-arg="${key}" aria-pressed="${key === 'all' ? picked.size === 0 : picked.has(key as never)}">${label}</button>`).join('');
  // 상세검색: the criteria hidden behind the toggle still count while it is closed, so the toggle says how many are on
  const advOn = (skill !== '' ? 1 : 0) + mine.length + (picked.size > 1 ? 1 : 0);
  const advBar = `<div class="dex-advbar"><button data-action="dexAdv" aria-expanded="${adv}">상세검색 ${adv ? '▾' : '▸'}${advOn ? ` (${advOn})` : ''}</button>${adv ? '<span class="dex-mode">역할은 여러 개를 고르면 모두 가진 유닛</span>' : ''}</div>`;
  const advPanel = adv ? `<div class="dex-adv"><form class="dex-skillsearch"><input type="search" name="skill" aria-label="기술로 찾기" placeholder="기술로 찾기 (기절, 폭발, 불길…)" value="${esc(skill)}"><button>찾기</button></form>${
    extra.state ? `<div class="dex-chips" role="group" aria-label="내 판 기준"><span class="dex-filter-label">내 판</span>${MINE_KEYS.map(k => `<button data-action="dexMine" data-arg="${k}" aria-pressed="${mine.includes(k)}">${MINE_LABEL[k]}</button>`).join('')}</div>` : ''}</div>` : '';
  const summary = `<div class="dex-summary"><span>${visible.length}종</span>${narrowed ? '<button data-action="dexReset">필터 초기화</button>' : ''}</div>`;
  const last = extra.back?.[extra.back.length - 1];
  const backName = last ? nameOf.get(last.id) : undefined;
  const back = backName ? `<button class="dex-back" data-action="dexBack">← ${esc(withRo(backName))}</button>` : '';
  return `<div class="modal dex-modal${adv ? ' dex-advanced' : ''}${browsable ? ' dex-browser' : ''}"><div class="modal-head">도감 <span class="dex-head-actions">${back}<button data-action="closeModal">닫기</button></span></div>
    <div class="dex-odds">${esc(summonOddsText(data, round))}</div>
    <div class="dex-searchbox"><div class="dex-top">${browsable ? `<form class="dex-search"><input type="search" name="query" aria-label="이름·재료 검색" placeholder="이름·재료 검색" value="${esc(query)}"><button>검색</button></form>` : ''}${summary}</div>${browsable ? recentHtml(extra.recent ?? [], query) : ''}</div>${browsable ? `<div class="dex-filters" role="group" aria-label="도감 분류">${filters}</div>` : ''}<div class="dex-chips" role="group" aria-label="도감 계열"><span class="dex-filter-label">계열</span>${kindRow}</div><div class="dex-chips" role="group" aria-label="도감 역할"><span class="dex-filter-label">역할</span>${roleRow}</div>${advBar}${advPanel}${browsable ? '<div class="dex-scroll">' : ''}<table class="dex"><thead><tr><th>등급</th><th>이름</th><th>재료</th></tr></thead><tbody>${rows || '<tr><td colspan="3">찾는 유닛이 없습니다.</td></tr>'}</tbody></table>${browsable ? '</div>' : ''}</div>`;
}

/** The recent searches under the search box: a chip runs its search, its × removes it. Hidden by CSS while a search shows and the box is not focused. */
function recentHtml(recent: readonly string[], query: string): string {
  if (!recent.length) return '';
  const chips = recent.map(t => `<span class="recent-chip"><button class="recent-run" data-action="dexRecent" data-arg="${esc(t)}" title="${esc(t)}">${esc(t)}</button><button class="recent-del" data-action="dexRecentDel" data-arg="${esc(t)}" aria-label="${esc(t)} 삭제" title="삭제">×</button></span>`).join('');
  return `<div class="dex-recent" data-searching="${query !== ''}"><span class="dex-filter-label">최근</span>${chips}</div>`;
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

function treeBox(from: string, nodes: RecipeNode[], unfold: ReadonlySet<string>): string {
  return `<div class="dex-tree-box"><div class="dex-tree-legend">✓ 보드에 있음 · ✗ 없음 · ▸ 하위 재료 펼치기</div>${treeList(from, nodes, unfold)}</div>`;
}

/** A ✓ material's own materials are not needed: they stay folded behind "▸ 하위 N개" until unfolded. */
function treeList(from: string, nodes: RecipeNode[], unfold: ReadonlySet<string>): string {
  return `<ul class="dex-tree">${nodes.map(n => {
    const key = branchKey(from, n.path);
    const foldable = n.mark === 'have' && n.children.length > 0;
    const shown = n.children.length > 0 && (!foldable || unfold.has(key));
    const fold = foldable
      ? `<button class="dex-fold" data-action="dexFold" data-arg="${esc(key)}" aria-expanded="${shown}">${shown ? '▾' : '▸'} 하위 ${treeSize(n)}개</button>`
      : '';
    return `<li class="${n.mark}"><div class="node">${MARK[n.mark]}<span class="dot" style="background:${GRADE_COLOR[n.grade]}"></span>${link(n.id, n.name, from)}${n.cost ? `<span class="combine-cost">+ ${esc(n.cost)}</span>` : ''}${fold}</div>${shown ? treeList(from, n.children, unfold) : ''}</li>`;
  }).join('')}</ul>`;
}

function targetButton(id: string, story: { target: string | null; canSet: boolean }): string {
  const on = story.target === id;
  // pressing the current target again clears it
  return `<button class="dex-target${on ? ' on' : ''}" data-action="storyTarget" data-arg="${on ? '' : esc(id)}"${story.canSet ? '' : ' disabled'} title="설화 의뢰 목표">${on ? '목표 ✓' : '목표'}</button>`;
}
