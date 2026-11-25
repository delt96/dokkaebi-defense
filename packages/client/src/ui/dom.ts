export function el(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node;
}

export function esc(s: string | number): string {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const last = new WeakMap<HTMLElement, string>();
/** Lists that keep their scroll position when the panel around them is redrawn. */
const KEEP_SCROLL = ['.helper', '.nc-list', '.quest-scroll', '.econ-body', '.card-recipes .combine-options', '.ud-body', '.target-scroll'];

export function setHtml(node: HTMLElement, html: string): void {
  if (last.get(node) === html) return;
  last.set(node, html);
  // a box keeps its scroll only when the redraw puts the same list (same data-scroll-key) back in its place
  const boxes = (selector: string) => Array.from(node.querySelectorAll<HTMLElement>(selector));
  const kept = KEEP_SCROLL.map(selector => boxes(selector).map(box => ({ key: box.dataset.scrollKey, top: box.scrollTop })));
  node.innerHTML = html;
  KEEP_SCROLL.forEach((selector, s) => boxes(selector).forEach((box, i) => {
    const old = kept[s]![i];
    if (old?.top && box.dataset.scrollKey === old.key) box.scrollTop = old.top;
  }));
}

/** A focused control named by its data attributes, so the copy a redraw puts in its place can be found again. */
export interface FocusMark { action?: string; arg?: string; recipe?: string }

export function focusedIn(node: HTMLElement): FocusMark | null {
  const active = document.activeElement as HTMLElement | null | undefined;
  if (!active?.dataset || active === node || !node.contains(active)) return null;
  return { action: active.dataset.action, arg: active.dataset.arg, recipe: active.dataset.recipe };
}

/**
 * After a redraw of `node` dropped the focus, give it to the same control again, or to `fallback` when the control is
 * gone (a pressed '+N개 더'). Focus that moved out of `node` on its own is left alone.
 */
export function refocusIn(node: HTMLElement, mark: FocusMark | null, fallback: string): void {
  if (!mark) return;
  const active = document.activeElement;
  if (active && active !== document.body && active.isConnected) return;
  const same = Array.from(node.querySelectorAll<HTMLElement>('[data-action], [data-recipe]')).find(e =>
    e.dataset.action === mark.action && e.dataset.arg === mark.arg && e.dataset.recipe === mark.recipe && !e.hasAttribute('disabled'));
  (same ?? node.querySelector<HTMLElement>(fallback))?.focus({ preventScroll: true });
}

/** A finger that moves this far (page px) is scrolling, not tapping. */
const TAP_SLOP_PX = 10;

export function onAction(node: HTMLElement, handler: (action: string, arg: string) => void): void {
  const pressed = (ev: Event) => {
    const target = (ev.target as HTMLElement).closest<HTMLElement>('[data-action]');
    return target && node.contains(target) && !target.hasAttribute('disabled') ? target : null;
  };
  const activate = (ev: Event) => {
    const target = pressed(ev);
    if (target) handler(target.dataset.action!, target.dataset.arg ?? '');
  };
  let tap: { id: number; x: number; y: number; action: string; arg: string } | null = null;
  let watching = false;
  // The lift can land outside `node` (or on nothing, after a redraw), so the rest of a touch is followed on window.
  const watchTouch = () => {
    if (watching) return;
    watching = true;
    window.addEventListener('pointermove', ev => {
      if (tap && ev.pointerId === tap.id && Math.hypot(ev.clientX - tap.x, ev.clientY - tap.y) > TAP_SLOP_PX) tap = null;
    });
    window.addEventListener('pointercancel', ev => { if (tap && ev.pointerId === tap.id) tap = null; });
    window.addEventListener('pointerup', ev => {
      const t = tap;
      if (!t || ev.pointerId !== t.id) return;
      tap = null;
      if (Math.hypot(ev.clientX - t.x, ev.clientY - t.y) > TAP_SLOP_PX) return;
      const now = Array.from(node.querySelectorAll<HTMLElement>('[data-action]'))
        .find(e => e.dataset.action === t.action && (e.dataset.arg ?? '') === t.arg);
      if (now && !now.hasAttribute('disabled')) handler(t.action, t.arg);
    });
  };
  // Handle a mouse press before a panel redraw can remove the pointer target.
  // A touch would fire the button a scroll starts on, so it waits for the lift and remembers the button by its data.
  node.addEventListener('pointerdown', ev => {
    if (ev.button !== 0) return;
    if (ev.pointerType !== 'touch' && ev.pointerType !== 'pen') return activate(ev);
    watchTouch();
    const target = pressed(ev);
    tap = target && { id: ev.pointerId, x: ev.clientX, y: ev.clientY, action: target.dataset.action!, arg: target.dataset.arg ?? '' };
  });
  // Keyboard and assistive technology produce clicks without a pointer press.
  node.addEventListener('click', ev => { if (ev.detail === 0) activate(ev); });
}
