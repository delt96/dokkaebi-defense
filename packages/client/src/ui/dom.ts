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

export function onAction(node: HTMLElement, handler: (action: string, arg: string) => void): void {
  const activate = (ev: Event) => {
    const target = (ev.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!target || !node.contains(target) || target.hasAttribute('disabled')) return;
    handler(target.dataset.action!, target.dataset.arg ?? '');
  };
  // Handle the press before a panel redraw can remove the pointer target.
  node.addEventListener('pointerdown', ev => { if (ev.button === 0) activate(ev); });
  // Keyboard and assistive technology produce clicks without a pointer press.
  node.addEventListener('click', ev => { if (ev.detail === 0) activate(ev); });
}
