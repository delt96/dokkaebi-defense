import type { GameState } from '@dorandi/logic';
import type { Lane } from '@dorandi/logic';
import { GRADE_COLOR, STAGE_W, stageToCell } from '../layout';
import { esc } from './dom';
import { storageStacks } from './models';

/** Unit ids with a sprite file (glob keys only, nothing is imported); others get a grade-coloured disc. */
const SPRITE_IDS: ReadonlySet<string> = new Set(
  Object.keys(import.meta.glob('../../public/sprites/*.png')).map(p => p.slice(p.lastIndexOf('/') + 1, -'.png'.length)),
);

/** Two big columns hold this many stacks; more switch to three small ones. */
const ROOMY_STACKS = 12;
export const STORE_ALL_KEY = 'G';

function iconHtml(defId: string, name: string, grade: number): string {
  if (SPRITE_IDS.has(defId)) return `<img src="${import.meta.env.BASE_URL}sprites/${esc(defId)}.png" alt="" draggable="false">`;
  return `<span class="stack-disc" style="background:${GRADE_COLOR[grade]}">${esc(name.slice(0, 1))}</span>`;
}

/** The storage column: a 모두 보관 button and one stack per kind (sprite, grade colour, ×N, a small sell button). */
/** `jige` is the 지게 held on a 60-round lane (each stack then gets its swap button), undefined elsewhere. */
export function storageHtml(state: GameState, jige?: number): string {
  const stacks = storageStacks(state);
  const total = stacks.reduce((n, s) => n + s.count, 0);
  const list = stacks.map(s => `<div class="stack" style="--g:${GRADE_COLOR[s.grade]}">
      <button class="stack-take" data-stack="${esc(s.defId)}" title="${esc(s.name)} ×${s.count} · 누르면 꺼내기, 끌어서 칸에 놓기"><span class="stack-icon">${iconHtml(s.defId, s.name, s.grade)}</span><span class="stack-n">×${s.count}</span></button>
      <button class="stack-sell" data-action="sellStored" data-arg="${esc(s.defId)}" title="${esc(s.name)} 1개 판매 +${s.sellPrice}냥" aria-label="${esc(s.name)} 1개 판매 +${s.sellPrice}냥">냥</button>${jige === undefined ? '' : `
      <button class="stack-swap" data-action="jigeOpen" data-arg="storage:${esc(s.defId)}" title="${esc(s.name)} 지게 바꾸기 · 보유 지게 ${jige}개" aria-label="${esc(s.name)} 지게 바꾸기"${jige < 1 ? ' disabled' : ''}>R</button>`}
    </div>`).join('');
  return `<div class="storage-head"><b>보관함</b>${total ? `<span>${total}</span>` : ''}</div>
    <button class="storage-all" data-action="storeAll" title="판 위의 1·2등급을 모두 보관 (${STORE_ALL_KEY})">1·2등급<br>모두 보관</button>
    ${list ? `<div class="stacks${stacks.length > ROOMY_STACKS ? ' dense' : ''}">${list}</div>` : '<p class="storage-empty">1·2등급 유닛을 여기로 끌어 놓으세요</p>'}`;
}

/** The board cell under a page point, or null outside the board (the stage is scaled to the window). */
export function cellAtPage(lane: Lane, stage: HTMLElement, clientX: number, clientY: number): number | null {
  const r = stage.getBoundingClientRect();
  const zoom = r.width / STAGE_W || 1;
  return stageToCell(lane, (clientX - r.left) / zoom, (clientY - r.top) / zoom);
}

const DRAG_PX = 4;

/**
 * Press handling for the stacks: a press without movement takes one unit out to the best free slot, a drag drops it on
 * the board cell under the pointer. Keyboard clicks take one out like a press.
 */
export function wireStorage(
  box: HTMLElement, stage: HTMLElement, lane: () => Lane, take: (defId: string, slot?: number) => void, enabled: () => boolean,
): void {
  let drag: { defId: string; x: number; y: number; ghost: HTMLElement | null; html: string } | null = null;
  const end = () => {
    drag?.ghost?.remove();
    drag = null;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancel);
  };
  const place = (ghost: HTMLElement, ev: PointerEvent) => {
    const r = stage.getBoundingClientRect();
    const zoom = r.width / STAGE_W || 1;
    ghost.style.left = `${(ev.clientX - r.left) / zoom - 12}px`;
    ghost.style.top = `${(ev.clientY - r.top) / zoom - 12}px`;
  };
  function move(ev: PointerEvent): void {
    if (!drag) return;
    if (!drag.ghost && Math.hypot(ev.clientX - drag.x, ev.clientY - drag.y) >= DRAG_PX) {
      drag.ghost = document.createElement('div');
      drag.ghost.className = 'stack-ghost';
      drag.ghost.innerHTML = drag.html;
      stage.append(drag.ghost);
    }
    if (drag.ghost) place(drag.ghost, ev);
  }
  function up(ev: PointerEvent): void {
    if (!drag) return;
    const { defId, ghost } = drag;
    end();
    if (!enabled()) return;
    if (!ghost) { take(defId); return; }
    const cell = cellAtPage(lane(), stage, ev.clientX, ev.clientY);
    if (cell !== null) take(defId, cell);
  }
  function cancel(): void { end(); }
  box.addEventListener('pointerdown', ev => {
    const button = (ev.target as HTMLElement).closest<HTMLElement>('[data-stack]');
    if (ev.button !== 0 || !button || !enabled()) return;
    ev.preventDefault();
    end();
    drag = { defId: button.dataset.stack!, x: ev.clientX, y: ev.clientY, ghost: null, html: button.querySelector('.stack-icon')?.innerHTML ?? '' };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  });
  // keyboard and assistive technology click without a pointer press
  box.addEventListener('click', ev => {
    const button = (ev.target as HTMLElement).closest<HTMLElement>('[data-stack]');
    if (ev.detail === 0 && button && enabled()) take(button.dataset.stack!);
  });
}
