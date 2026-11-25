// @vitest-environment happy-dom
import { beforeAll, describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const px = (v: string) => parseFloat(v);

describe('item pieces meet the scale-1 floor (10px text, 24px buttons)', () => {
  beforeAll(() => {
    const style = document.createElement('style');
    style.textContent = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/ui/style.css'), 'utf8');
    document.head.append(style);
    document.body.innerHTML = `
      <div id="bottom"><div class="item-pop"><b>아이템 붙이기</b><button>힘 부적 (2개) 붙이기</button><small class="item-warn">날쌘 부적 · 붙이면 지금 아이템은 사라집니다</small></div></div>
      <div id="left"><div class="unit-item"><span class="ui-name">없음</span><span class="item-hint">장터(B)</span></div><span class="item-tag">힘</span></div>`;
  });

  test('the online item list', () => {
    expect(px(getComputedStyle(document.querySelector('#bottom .item-pop')!).fontSize)).toBeGreaterThanOrEqual(10);
    expect(getComputedStyle(document.querySelector('#bottom .item-pop button')!).minHeight).toBe('24px');
  });

  test('the warning, the hint and the name tag', () => {
    for (const sel of ['.item-warn', '.item-hint', '.item-tag']) {
      expect(px(getComputedStyle(document.querySelector(sel)!).fontSize), sel).toBeGreaterThanOrEqual(10);
    }
  });
});
