// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createGame, loadGameData } from '@dorandi/logic';
import { GameDriver } from '../src/driver';
import { dexHtml } from '../src/ui/dex';
import { roleText, unitRoles } from '../src/ui/dex-roles';
import { dexEntries, dexGo, dexNavStart, dexShows } from '../src/ui/models';
import { mountUi } from '../src/ui/mount';
import { STAGE_HTML, key, press } from './fixtures/net';

const d3 = loadGameData('stage3');
const d2 = loadGameData('stage2');
const tagsOf = (data: typeof d3, id: string) => unitRoles(data.units.find(u => u.id === id)!).map(roleText);
const ids = (html: string) => [...html.matchAll(/data-dex-id="([^"]+)"/g)].map(m => m[1]);

describe('unitRoles', () => {
  test('a 물깎 unit shows its amount', () => {
    expect(tagsOf(d2, 'dadeumi')).toEqual(['물깎 15%']);
    expect(tagsOf(d3, 'sutdarimi')).toContain('마깎 12%');
    expect(tagsOf(d3, 'sutdarimi')).not.toContain('물깎 12%');
  });

  test('약연 is a physical unit with a 마깎', () => {
    expect(d3.units.find(u => u.id === 'yagyeon')!.damageType).toBe('physical');
    expect(tagsOf(d3, 'yagyeon')).toContain('마깎 15%');
    expect(tagsOf(d3, 'yagyeon')).not.toContain('물깎 15%');
  });

  test('slow, stun, area and aura come from their effects', () => {
    expect(tagsOf(d3, 'jipsingol')).toEqual(['둔화']);
    expect(tagsOf(d3, 'mulle')).toContain('오라');
    expect(tagsOf(d3, 'mogitbul')).toEqual(['둔화', '광역']);
    expect(tagsOf(d3, 'buk')).toEqual(['물깎 15%', '기절', '오라']);
    // an untyped aura 깎 (stage 1-2 data) counts for both
    expect(tagsOf(d2, 'jangdok')).toEqual(['물깎 10%', '마깎 10%', '오라']);
  });

  test('every unit with a stun effect has the 기절 role', () => {
    const stunners = d3.units.filter(u => u.skills.some(s => s.effects.some(e => e.kind === 'stun')));
    expect(stunners.length).toBeGreaterThan(0);
    for (const u of stunners) expect(tagsOf(d3, u.id)).toContain('기절');
  });
});

describe('dex filters', () => {
  const all = dexEntries(d3);
  const shown = (filter: string, query: string, more: { kind?: string; role?: string }) => all.filter(e => dexShows(d3, e, filter, query, more)).map(e => e.id);

  test('계열 and 역할 narrow the list, and combine with grade and search by AND', () => {
    const mag = shown('all', '', { role: 'magVuln' });
    expect(mag).toContain('sutdarimi');
    expect(mag).toContain('yagyeon');
    const magMagical = shown('all', '', { kind: 'magical', role: 'magVuln' });
    expect(magMagical).toContain('sutdarimi');
    expect(magMagical).not.toContain('yagyeon');
    const grade = all.find(e => e.id === 'sutdarimi')!.grade;
    expect(shown(String(grade), '', { kind: 'magical', role: 'magVuln' })).toContain('sutdarimi');
    expect(shown(String(grade === 6 ? 1 : grade + 1), '', { role: 'magVuln' })).not.toContain('sutdarimi');
    expect(shown('all', '숯다리미', { role: 'magVuln' })).toEqual(['sutdarimi']);
    expect(shown('all', '숯다리미', { role: 'physVuln' })).toEqual([]);
  });

  test('the html shows tags, the count and the reset button only when something is set', () => {
    const plain = dexHtml(d3);
    expect(plain).toContain(`<span>${all.length}종</span>`);
    expect(plain).not.toContain('dexReset');
    const html = dexHtml(d3, undefined, 'all', '', 1, {}, { kind: 'magical', role: 'magVuln' });
    const rows = ids(html);
    expect(rows).toContain('sutdarimi');
    expect(rows).not.toContain('yagyeon');
    expect(html).toContain(`<span>${rows.length}종</span>`);
    expect(html).toContain('data-action="dexReset">필터 초기화</button>');
    expect(html).toContain('<span class="role-tag role-magVuln">마깎 12%</span>');
    expect(html).toContain('data-action="dexKind" data-arg="magical" aria-pressed="true"');
    expect(html).toContain('data-action="dexRole" data-arg="magVuln" aria-pressed="true"');
  });

  test('20-round data has the 계열 and 역할 rows, but no grade row or search', () => {
    const html = dexHtml(d2, undefined, 'all', '', 1, {}, { role: 'physVuln' });
    expect(ids(html)).toContain('dadeumi');
    expect(html).toContain('data-action="dexRole"');
    expect(html).not.toContain('dex-search');
    expect(html).not.toContain('data-action="dexFilter"');
    expect(html).toContain('필터 초기화');
  });

  test('following a link clears 계열/역할 only when they hide the target', () => {
    const nav = { ...dexNavStart(), role: 'magVuln' };
    expect(dexGo(d3, nav, 'sutdarimi', 'top')).toMatchObject({ role: 'magVuln', filter: 'all' });
    expect(dexGo(d3, nav, 'jipsingol', 'top')).toMatchObject({ role: 'all', kind: 'all', focus: 'jipsingol' });
  });
});

class FakeScene {
  selectedId: number | null = null;
  reduceEffects = false;
  onFrame?: () => void;
  onSelect(): void {}
  onEvents(): void {}
}

describe('dex filters in the mounted ui', () => {
  beforeEach(() => { document.body.innerHTML = STAGE_HTML; });
  afterEach(() => { vi.restoreAllMocks(); });

  test('chips filter, a role chip toggles off, reset clears everything, and the search keeps working', () => {
    mountUi(new GameDriver(createGame(d3, 1)), new FakeScene() as never);
    const modal = document.getElementById('modal')!;
    const rows = () => ids(modal.innerHTML);
    press(document.querySelector('[data-action="openDex"]'));
    expect(rows()).toHaveLength(d3.units.length);
    expect(modal.querySelector('[data-action="dexReset"]')).toBeNull();

    press(modal.querySelector('[data-action="dexRole"][data-arg="magVuln"]'));
    expect(rows()).toContain('yagyeon');
    press(modal.querySelector('[data-action="dexKind"][data-arg="magical"]'));
    expect(rows()).not.toContain('yagyeon');
    expect(rows()).toContain('sutdarimi');

    const input = modal.querySelector<HTMLInputElement>('.dex-search input')!;
    input.value = '숯다리미';
    modal.querySelector<HTMLFormElement>('.dex-search')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(rows()).toEqual(['sutdarimi']);
    expect(modal.querySelector('.dex-summary')!.textContent).toContain('1종');

    press(modal.querySelector('[data-action="dexRole"][data-arg="magVuln"]'));
    expect(modal.querySelector('[data-action="dexRole"][data-arg="all"]')!.getAttribute('aria-pressed')).toBe('true');
    press(modal.querySelector('[data-action="dexReset"]'));
    expect(rows()).toHaveLength(d3.units.length);
    expect(modal.querySelector<HTMLInputElement>('.dex-search input')!.value).toBe('');
    expect(modal.querySelector('[data-action="dexReset"]')).toBeNull();
  });

  test('works in the 20-round dex and the D hotkey still toggles it', () => {
    mountUi(new GameDriver(createGame(d2, 1)), new FakeScene() as never);
    const modal = document.getElementById('modal')!;
    key('KeyD');
    expect(modal.querySelector('.dex-modal')).not.toBeNull();
    press(modal.querySelector('[data-action="dexRole"][data-arg="physVuln"]'));
    expect(ids(modal.innerHTML)).toContain('dadeumi');
    expect(ids(modal.innerHTML).length).toBeLessThan(d2.units.length);
    key('KeyD');
    expect(modal.querySelector('.dex-modal')).toBeNull();
  });
});
