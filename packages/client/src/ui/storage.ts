import { unitDefFast, type GameState } from '@dorandi/logic';
import type { Lane } from '@dorandi/logic';
import { GRADE_COLOR, STAGE_W, gradeShape, stageToCell } from '../layout';
import { esc } from './dom';
import { storageStacks, storedCombineOptions, unitSkillText } from './models';
import { typeBadgeHtml } from './badge';
import { SPRITE_IDS } from '../art';

/** Two big columns hold this many stacks; more switch to three small ones. */
const ROOMY_STACKS = 12;
export const STORE_ALL_KEY = 'G';
/** Stores the selected unit (grades 1-2) from its card, next to S for selling. */
export const STORE_KEY = 'A';

export function iconHtml(defId: string, name: string, grade: number): string {
  if (SPRITE_IDS.has(defId)) return `<img src="${import.meta.env.BASE_URL}sprites/${esc(defId)}.png" alt="" draggable="false">`;
  return `<span class="stack-disc" style="background:${GRADE_COLOR[grade]}">${esc(name.slice(0, 1))}</span>`;
}

/** A small face for the 상세 window and the left card: the sprite, or the grade disc when the unit has none. `shape` adds the board's grade shape at its top left. */
export function unitFaceHtml(defId: string, name: string, grade: number, shape = false): string {
  const mark = shape ? `<i class="gshape ${gradeShape(grade)}" style="background:${GRADE_COLOR[grade]}"></i>` : '';
  return `<span class="unit-face" style="--g:${GRADE_COLOR[grade]}">${iconHtml(defId, name, grade)}${mark}</span>`;
}

export function storageInfoModel(state: GameState, defId: string | null) {
  if (defId === null) return null;
  const stack = storageStacks(state).find(s => s.defId === defId);
  if (!stack) return null;
  const def = unitDefFast(state.data, stack.defId);
  return {
    ...stack, skill: unitSkillText(state.data, def).split(' / ')[0] || '특수 능력 없음',
    combines: storedCombineOptions(state, stack.defId).slice(0, 3),
  };
}

export function storageInfoHtml(state: GameState, info: NonNullable<ReturnType<typeof storageInfoModel>>): string {
  return `<div class="storage-info">
    <div class="up-name">${unitFaceHtml(info.defId, info.name, info.grade)}<b>${esc(info.name)} ×${info.count}</b></div>
    <div class="up-sub">${info.grade}등급 · ${typeBadgeHtml(state.data, info.defId, true)}</div>
    <p class="up-skill" title="${esc(info.skill)}">${esc(info.skill)}</p>
    ${info.combines.map(o => `<button class="storage-combine" data-action="combine" data-arg="${esc(o.result)}" title="${esc(`${o.name} 조합${o.cost ? ` · ${o.cost}` : ''}`)}">${esc(o.name)} 조합</button>`).join('')}
    <button data-action="sellStored" data-arg="${esc(info.defId)}">1개 판매 +${info.sellPrice}냥</button>
    <button data-action="closeStorageInfo" aria-label="보관 정보 닫기">×</button>
  </div>`;
}

/** The storage column: a 모두 보관 button and one stack per kind (sprite, grade colour, ×N, a sell strip under it). */
/** `jige` is the 지게 held on a 60-round lane (each stack then gets its swap button), undefined elsewhere. */
/** `sellArmed` says which stack's sell strip has had its first press and waits for the second. */
/** `inspected` is the stack whose info is open; it stays marked in the column while that info shows. */
export function storageHtml(state: GameState, jige?: number, sellArmed: (defId: string) => boolean = () => false, inspected: string | null = null): string {
  const stacks = storageStacks(state);
  const total = stacks.reduce((n, s) => n + s.count, 0);
  const list = stacks.map(s => `<div class="stack${s.defId === inspected ? ' inspected' : ''}" style="--g:${GRADE_COLOR[s.grade]}">
      <button class="stack-take" data-stack="${esc(s.defId)}" title="${esc(s.name)} ×${s.count} · 눌러서 정보, 끌어서 꺼내기"${s.defId === inspected ? ' aria-current="true"' : ''}><span class="stack-icon">${iconHtml(s.defId, s.name, s.grade)}</span><span class="stack-n">×${s.count}</span></button>
      ${stackSellHtml(s.defId, s.name, s.sellPrice, sellArmed(s.defId))}${jige === undefined ? '' : `
      <button class="stack-swap" data-action="jigeOpen" data-arg="storage:${esc(s.defId)}" title="${esc(s.name)} 지게 바꾸기 · 보유 지게 ${jige}개" aria-label="${esc(s.name)} 지게 바꾸기"${jige < 1 ? ' disabled' : ''}>R</button>`}
    </div>`).join('');
  return `<div class="storage-head"><b>보관함</b>${total ? `<span>${total}</span>` : ''}</div>
    <button class="storage-all" data-action="storeAll" title="판 위의 1·2등급을 모두 보관 (${STORE_ALL_KEY})">1·2등급<br>모두 보관</button>
    ${list ? `<div class="storage-hint">눌러서 정보<br>끌어서 꺼내기</div><div class="stacks${stacks.length > ROOMY_STACKS ? ' dense' : ''}">${list}</div>` : '<p class="storage-empty">1·2등급 유닛을 여기로 끌어 놓으세요</p>'}`;
}

function stackSellHtml(defId: string, name: string, price: number, armed: boolean): string {
  const label = `${armed ? '한 번 더 누르면 ' : ''}${name} 1개 판매 +${price}냥`;
  return `<button class="stack-sell${armed ? ' armed' : ''}" data-action="sellStack" data-arg="${esc(defId)}" title="${esc(label)}" aria-label="${esc(label)}">${armed ? '확인' : '판매'}</button>`;
}

/** The board cell under a page point, or null outside the board (the stage is scaled to the window). */
export function cellAtPage(lane: Lane, stage: HTMLElement, clientX: number, clientY: number): number | null {
  const r = stage.getBoundingClientRect();
  const zoom = r.width / STAGE_W || 1;
  return stageToCell(lane, (clientX - r.left) / zoom, (clientY - r.top) / zoom);
}

const DRAG_PX = 4;

/**
 * A press or keyboard click inspects the stack. A drag drops one unit on the board cell under the pointer.
 */
export function wireStorage(
  box: HTMLElement, stage: HTMLElement, lane: () => Lane, take: (defId: string, slot: number) => void,
  inspect: (defId: string) => void, enabled: () => boolean,
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
    if (!ghost) { inspect(defId); return; }
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
    if (ev.detail === 0 && button && enabled()) inspect(button.dataset.stack!);
  });
}
