export function el(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node;
}

export function esc(s: string | number): string {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const last = new WeakMap<HTMLElement, string>();
export function setHtml(node: HTMLElement, html: string): void {
  if (last.get(node) === html) return;
  last.set(node, html);
  node.innerHTML = html;
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
