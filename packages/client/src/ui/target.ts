import { GRADE_COLOR } from '../layout';
import { esc } from './dom';
import type { TargetNode } from './models';

export function readTarget(key: string | undefined): string | null {
  try { return key ? sessionStorage.getItem(key) : null; } catch { return null; }
}

export function writeTarget(key: string | undefined, target: string | null): void {
  if (!key) return;
  try {
    if (target) sessionStorage.setItem(key, target);
    else sessionStorage.removeItem(key);
  } catch { /* The current match can still keep the pin in memory. */ }
}

export function pinButton(id: string, target: string | null): string {
  const pinned = id === target;
  return `<button class="pin-btn" data-action="pinTarget" data-arg="${esc(id)}" aria-pressed="${pinned}">${pinned ? '목표 해제' : '목표로'}</button>`;
}

const LOCATION = { board: '진영에 있음', storage: '보관함에 있음', missing: '없음' } as const;
const MARK = { board: '✓', storage: '✓', missing: '✗' } as const;
const gradeStyle = (grade: number) => `style="--g:${GRADE_COLOR[grade] ?? 'var(--ink)'}"`;

/**
 * One level of the pinned tree. Depth 1 lists what the target itself takes, each one a block of its own with a rule
 * above it; deeper levels are what that material takes in turn — indented, smaller, and hung on a line in the color of
 * the unit they make, so a material that shows up both on its own and inside another one reads as two different needs.
 */
function materials(nodes: TargetNode[], parent: TargetNode, depth: number): string {
  if (!nodes.length) return '';
  return `<ul class="target-level target-depth-${Math.min(depth, 3)}" ${gradeStyle(parent.grade)}>${nodes.map(node => {
    const title = `${depth === 1 ? '바로 넣는 재료' : `${parent.name}의 재료`} · ${node.name} ${node.grade}등급 · ${LOCATION[node.location]}`;
    return `<li><div class="target-material target-${node.location}" title="${esc(title)}"><i>${MARK[node.location]}</i><b ${gradeStyle(node.grade)}>${esc(node.name)}</b></div>${materials(node.children, node, depth + 1)}</li>`;
  }).join('')}</ul>`;
}

export function targetHtml(node: TargetNode, folded: boolean): string {
  const owned = node.location === 'board' ? '보유 · 진영' : node.location === 'storage' ? '보유 · 보관함' : '';
  return `<div class="target-head"><button data-action="foldTarget" aria-expanded="${!folded}" title="${esc(`${node.name} ${node.grade}등급`)}">${folded ? '▸' : '▾'} <b ${gradeStyle(node.grade)}>${esc(node.name)}</b></button>
    <button data-action="clearTarget" aria-label="목표 해제">×</button></div>
    ${folded ? '' : `<div class="target-scroll" data-scroll-key="${esc(node.id)}">${owned ? `<div class="target-owned">${owned}</div>` : `<div class="target-legend"><span class="legend-board">✓진영</span> <span class="legend-storage">✓보관</span> <span class="legend-missing">✗없음</span></div>${materials(node.children, node, 1)}`}</div>`}`;
}
