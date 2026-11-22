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
const KEEP_SCROLL = ['.helper', '.quest-scroll', '.econ-body', '.card-recipes .combine-options', '.ud-body', '.target-scroll'];

export function setHtml(node: HTMLElement, html: string): void {
  if (last.get(node) === html) return;
  last.set(node, html);
  const kept = KEEP_SCROLL.flatMap(selector => {
    const box = node.querySelector<HTMLElement>(selector);
    return box?.scrollTop ? [{ selector, key: box.dataset.scrollKey, top: box.scrollTop }] : [];
  });
  node.innerHTML = html;
  for (const { selector, key, top } of kept) {
    const box = node.querySelector<HTMLElement>(selector);
    if (box && box.dataset.scrollKey === key) box.scrollTop = top;
  }
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
