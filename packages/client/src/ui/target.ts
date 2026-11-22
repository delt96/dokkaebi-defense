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
  return `<button class="pin-btn" data-action="pinTarget" data-arg="${esc(id)}" aria-pressed="${pinned}">${pinned ? '고정 해제' : '고정'}</button>`;
}

const LOCATION = { board: '✓ 진영', storage: '✓ 보관함', missing: '없음' } as const;
const mark = (node: TargetNode) => `<span class="target-${node.location}">${LOCATION[node.location]}</span>`;

function materials(nodes: TargetNode[]): string {
  if (!nodes.length) return '';
  return `<ul>${nodes.map(node => `<li><div class="target-material"><b>${esc(node.name)}</b>${mark(node)}</div>${materials(node.children)}</li>`).join('')}</ul>`;
}

export function targetHtml(node: TargetNode, folded: boolean): string {
  const owned = node.location === 'board' ? '보유 · 진영' : node.location === 'storage' ? '보유 · 보관함' : '';
  return `<div class="target-head"><button data-action="foldTarget" aria-expanded="${!folded}" title="${esc(node.name)}">${folded ? '▸' : '▾'} ${esc(node.name)}</button>
    <button data-action="clearTarget" aria-label="목표 해제">×</button></div>
    ${folded ? '' : `<div class="target-scroll" data-scroll-key="${esc(node.id)}">${owned ? `<div class="target-owned">${owned}</div>` : materials(node.children)}</div>`}`;
}
