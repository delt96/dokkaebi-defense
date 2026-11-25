// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createGame, loadGameData } from '@dorandi/logic';
import { GameDriver } from '../src/driver';
import { dexHtml } from '../src/ui/dex';
import { roleText, unitRoles } from '../src/ui/dex-roles';
import { RECENT_KEY, VIEW_KEY, addRecent, loadRecent, loadView, removeRecent, saveRecent, saveView } from '../src/ui/dex-memory';
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
    const html = dexHtml(d3, 'all', '', 1, {}, { kind: 'magical', role: 'magVuln' });
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
    const html = dexHtml(d2, 'all', '', 1, {}, { role: 'physVuln' });
    expect(ids(html)).toContain('dadeumi');
    expect(html).toContain('data-action="dexRole"');
    expect(html).not.toContain('class="dex-search"');
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
  beforeEach(() => { document.body.innerHTML = STAGE_HTML; localStorage.clear(); });
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

describe('dex memory', () => {
  const fake = () => { const m = new Map<string, string>(); return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; };
  const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };

  test('recent searches: newest first, no duplicates, five at most, blanks ignored', () => {
    let list: string[] = [];
    for (const t of ['a', 'b', 'c', 'd', 'e', 'f']) list = addRecent(list, t);
    expect(list).toEqual(['f', 'e', 'd', 'c', 'b']);
    expect(addRecent(list, 'd')).toEqual(['d', 'f', 'e', 'c', 'b']);
    expect(addRecent(list, '  d  ')).toEqual(['d', 'f', 'e', 'c', 'b']);
    expect(addRecent(list, '   ')).toEqual(list);
    expect(removeRecent(list, 'e')).toEqual(['f', 'd', 'c', 'b']);
  });

  test('recent searches and the view survive a reload through storage', () => {
    const s = fake();
    saveRecent(['x', 'y'], s);
    saveView({ filter: '5', kind: 'magical', role: 'slow', query: '짚', adv: true, skill: '폭발', mine: ['ready'] }, s);
    expect(loadRecent(s)).toEqual(['x', 'y']);
    expect(loadView(s)).toEqual({ filter: '5', kind: 'magical', role: 'slow', query: '짚', adv: true, skill: '폭발', mine: ['ready'] });
  });

  test('without usable storage everything falls back and nothing throws', () => {
    expect(() => saveRecent(['x'], broken)).not.toThrow();
    expect(() => saveView({ filter: 'all', kind: 'all', role: 'all', query: '', adv: false, skill: '', mine: [] }, broken)).not.toThrow();
    expect(loadRecent(broken)).toEqual([]);
    expect(loadView(broken)).toEqual({ filter: 'all', kind: 'all', role: 'all', query: '', adv: false, skill: '', mine: [] });
    expect(loadRecent(null)).toEqual([]);
    const bad = fake();
    bad.m.set(RECENT_KEY, '{oops'); bad.m.set(VIEW_KEY, '7');
    expect(loadRecent(bad)).toEqual([]);
    expect(loadView(bad).role).toBe('all');
  });

  test('chips render under the search box with a remove button', () => {
    const html = dexHtml(d3, 'all', '', 1, { recent: ['짚', '북'] });
    expect(html).toContain('data-action="dexRecent" data-arg="짚"');
    expect(html).toContain('data-action="dexRecentDel" data-arg="북"');
    expect(dexHtml(d3)).not.toContain('recent-chip');
    expect(dexHtml(d2, 'all', '', 1, { recent: ['짚'] })).not.toContain('dex-recent');
  });

  test('the recent row keeps its place: it is there before the first search and stays while a search shows', () => {
    expect(dexHtml(d3)).toContain('<div class="dex-recent"');
    const searching = dexHtml(d3, 'all', '짚', 1, { recent: ['짚'] });
    expect(searching).toContain('data-action="dexRecent" data-arg="짚"');
    expect(searching).not.toContain('data-searching');
  });
});

describe('dex memory in the mounted ui', () => {
  beforeEach(() => { document.body.innerHTML = STAGE_HTML; localStorage.clear(); });
  afterEach(() => { vi.restoreAllMocks(); });
  const search = (modal: HTMLElement, text: string) => {
    modal.querySelector<HTMLInputElement>('.dex-search input')!.value = text;
    modal.querySelector<HTMLFormElement>('.dex-search')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  };

  test('searches become chips; a chip reruns its search; × removes it; reload restores them', () => {
    mountUi(new GameDriver(createGame(d3, 1)), new FakeScene() as never);
    const modal = document.getElementById('modal')!;
    press(document.querySelector('[data-action="openDex"]'));
    search(modal, '숯다리미');
    search(modal, '약연');
    search(modal, '숯다리미');
    const chips = () => Array.from(modal.querySelectorAll('.recent-run')).map(b => b.textContent);
    expect(chips()).toEqual(['숯다리미', '약연']);
    press(modal.querySelector('.recent-run[data-arg="약연"]'));
    expect(ids(modal.innerHTML)).toContain('yagyeon');
    expect(chips()).toEqual(['약연', '숯다리미']);
    press(modal.querySelector('.recent-del[data-arg="숯다리미"]'));
    expect(chips()).toEqual(['약연']);
    expect(JSON.parse(localStorage.getItem('dorandi.dexRecent')!)).toEqual(['약연']);

    document.body.innerHTML = STAGE_HTML;
    mountUi(new GameDriver(createGame(d3, 1)), new FakeScene() as never);
    press(document.querySelector('[data-action="openDex"]'));
    expect(Array.from(document.querySelectorAll('.recent-run')).map(b => b.textContent)).toEqual(['약연']);
  });

  test('closing and reopening keeps the search text and filters, a reload too', () => {
    mountUi(new GameDriver(createGame(d3, 1)), new FakeScene() as never);
    const modal = document.getElementById('modal')!;
    press(document.querySelector('[data-action="openDex"]'));
    press(modal.querySelector('[data-action="dexKind"][data-arg="magical"]'));
    press(modal.querySelector('[data-action="dexRole"][data-arg="magVuln"]'));
    search(modal, '다리미');
    // buttons, not the D key: earlier tests' mounts still listen on window and would write the same storage
    press(modal.querySelector('[data-action="closeModal"]'));
    expect(modal.querySelector('.dex-modal')).toBeNull();
    press(document.querySelector('[data-action="openDex"]'));
    expect(modal.querySelector<HTMLInputElement>('.dex-search input')!.value).toBe('다리미');
    expect(ids(modal.innerHTML)).toEqual(['sutdarimi']);
    expect(modal.querySelector('[data-action="dexRole"][data-arg="magVuln"]')!.getAttribute('aria-pressed')).toBe('true');

    document.body.innerHTML = STAGE_HTML;
    mountUi(new GameDriver(createGame(d3, 1)), new FakeScene() as never);
    press(document.querySelector('[data-action="openDex"]'));
    expect(ids(document.getElementById('modal')!.innerHTML)).toEqual(['sutdarimi']);
  });

  test('a throwing localStorage does not break the dex', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    mountUi(new GameDriver(createGame(d3, 1)), new FakeScene() as never);
    const modal = document.getElementById('modal')!;
    press(document.querySelector('[data-action="openDex"]'));
    search(modal, '약연');
    expect(ids(modal.innerHTML)).toContain('yagyeon');
    expect(modal.querySelector('.recent-run')!.textContent).toBe('약연');
  });
});
