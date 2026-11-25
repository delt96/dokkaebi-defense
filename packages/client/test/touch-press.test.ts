// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from 'vitest';
import { onAction } from '../src/ui/dom';

const ptr = (type: string, target: Element, init: PointerEventInit = {}) =>
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, pointerId: 7, ...init }));

describe('onAction on touch', () => {
  let node: HTMLElement;
  let calls: string[];
  const button = () => node.querySelector<HTMLElement>('[data-action="buy"]')!;

  beforeEach(() => {
    document.body.innerHTML = '<div id="list"><button data-action="buy" data-arg="coin">사기</button></div>';
    node = document.getElementById('list')!;
    calls = [];
    onAction(node, (a, g) => calls.push(`${a}:${g}`));
  });

  it('a mouse press acts at once', () => {
    ptr('pointerdown', button(), { pointerType: 'mouse' });
    expect(calls).toEqual(['buy:coin']);
  });

  it('a touch acts on lift, not on contact', () => {
    ptr('pointerdown', button(), { pointerType: 'touch', clientX: 10, clientY: 10 });
    expect(calls).toEqual([]);
    ptr('pointerup', button(), { pointerType: 'touch', clientX: 12, clientY: 13 });
    expect(calls).toEqual(['buy:coin']);
  });

  it('a touch that moves like a scroll does nothing', () => {
    ptr('pointerdown', button(), { pointerType: 'touch', clientX: 10, clientY: 10 });
    ptr('pointermove', button(), { pointerType: 'touch', clientX: 10, clientY: 40 });
    ptr('pointerup', button(), { pointerType: 'touch', clientX: 10, clientY: 12 });
    expect(calls).toEqual([]);
  });

  it('a touch the browser takes over for scrolling does nothing', () => {
    ptr('pointerdown', button(), { pointerType: 'touch', clientX: 10, clientY: 10 });
    ptr('pointercancel', button(), { pointerType: 'touch' });
    ptr('pointerup', button(), { pointerType: 'touch', clientX: 10, clientY: 10 });
    expect(calls).toEqual([]);
  });

  it('a touch still acts when a redraw replaced the button before the lift', () => {
    ptr('pointerdown', button(), { pointerType: 'touch', clientX: 10, clientY: 10 });
    node.innerHTML = '<button data-action="buy" data-arg="coin">사기</button>';
    ptr('pointerup', document.body, { pointerType: 'touch', clientX: 10, clientY: 10 });
    expect(calls).toEqual(['buy:coin']);
  });

  it('a touch does nothing when the button went away or turned disabled before the lift', () => {
    ptr('pointerdown', button(), { pointerType: 'touch', clientX: 10, clientY: 10 });
    node.innerHTML = '<button data-action="buy" data-arg="coin" disabled>사기</button>';
    ptr('pointerup', document.body, { pointerType: 'touch', clientX: 10, clientY: 10 });
    ptr('pointerdown', button(), { pointerType: 'touch', clientX: 10, clientY: 10 });
    node.innerHTML = '';
    ptr('pointerup', document.body, { pointerType: 'touch', clientX: 10, clientY: 10 });
    expect(calls).toEqual([]);
  });

  it('the click a touch leaves behind does not act a second time', () => {
    ptr('pointerdown', button(), { pointerType: 'touch', clientX: 10, clientY: 10 });
    ptr('pointerup', button(), { pointerType: 'touch', clientX: 10, clientY: 10 });
    button().dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(calls).toEqual(['buy:coin']);
  });
});
