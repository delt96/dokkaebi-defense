// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, expect, test } from 'vitest';
import { applyLayout, applyOuterZoom, currentWins } from '../src/fit';
import { screenLayout } from '../src/layout';
import { STAGE_HTML } from './fixtures/net';

const here = dirname(fileURLToPath(import.meta.url));
const el = (id: string) => document.getElementById(id)!;
const ordered = (html: string) => ['id="win-left"', 'id="stage"', 'id="win-right"', 'id="screen"'].map(s => html.indexOf(s));

beforeEach(() => {
  delete document.documentElement.dataset.wins;
  document.documentElement.style.removeProperty('--outer-zoom');
});

test('index.html puts #win-left, #stage, #win-right in that order', () => {
  for (const html of [readFileSync(resolve(here, '../index.html'), 'utf8'), STAGE_HTML]) {
    const at = ordered(html);
    expect(at.every(i => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  }
  document.body.innerHTML = STAGE_HTML;
  expect(el('win-left').nextElementSibling).toBe(el('stage'));
  expect(el('stage').nextElementSibling).toBe(el('win-right'));
  expect(el('win-left').classList.contains('win-box')).toBe(true);
  expect(el('win-right').classList.contains('win-box')).toBe(true);
});

test('applyLayout places the board and both boxes and marks the place', () => {
  document.body.innerHTML = STAGE_HTML;
  expect(currentWins()).toBe('inside');
  applyLayout(screenLayout(1920, 953), el('stage'));
  expect([el('stage').style.transform, el('stage').style.left, el('stage').style.top]).toEqual(['scale(2)', '320px', '116px']);
  const left = el('win-left').style;
  expect([left.left, left.top, left.width, left.height, left.transform]).toEqual(['0px', '164px', '156px', '336px', 'scale(2)']);
  expect(el('win-right').style.left).toBe('1608px');
  expect(document.documentElement.dataset.wins).toBe('outside');
  expect(currentWins()).toBe('outside');
  expect(el('win-left').classList.contains('outside')).toBe(true);
  expect(el('win-right').classList.contains('outside')).toBe(true);

  applyLayout(screenLayout(1920, 1080), el('stage'));
  expect(el('stage').style.transform).toBe('scale(3)');
  expect(document.documentElement.dataset.wins).toBe('inside');
  expect(currentWins()).toBe('inside');
  expect(el('win-right').style.left).toBe('1374px');
  expect(el('win-right').style.transform).toBe('scale(3)');
  expect(el('win-right').style.width).toBe('182px');
  expect(el('win-left').classList.contains('outside')).toBe(false);
  expect(el('win-left').classList.contains('inside')).toBe(true);
});

test('applyOuterZoom writes --outer-zoom', () => {
  applyOuterZoom(1920, 1080);
  expect(document.documentElement.style.getPropertyValue('--outer-zoom')).toBe('2.25');
  applyOuterZoom(1920, 953);
  expect(document.documentElement.style.getPropertyValue('--outer-zoom')).toBe('1.5');
});

test('style.css scales outer screens and the band by --outer-zoom, not by window-size steps', () => {
  const css = readFileSync(resolve(here, '../src/ui/style.css'), 'utf8');
  expect(css).toContain('#screen > * { zoom: var(--outer-zoom, 1); }');
  const band = css.split('}').find(r => r.trimStart().startsWith('#conn-band {'));
  expect(band).toContain('zoom: var(--outer-zoom, 1)');
  expect(css).not.toContain('@media (min-width: 1280px) and (min-height: 720px)');
  expect(css).not.toContain('@media (min-width: 1920px) and (min-height: 1080px)');
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = (sel: string) => bare.split('}').find(r => r.split('{')[0]!.trim() === sel)?.split('{')[1];
  expect(rule('.win-box')).toMatch(/position: fixed;.*z-index: 5;.*transform-origin: top left/s);
  expect(rule('.win-box:empty')).toContain('display: none');
  expect(rule('.win-box.locked')).toContain('z-index: -1');
  expect(rule('.win-box.locked.outside')).toContain('opacity: .4');
});
