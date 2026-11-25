// @vitest-environment happy-dom
import { describe, expect, test, vi } from 'vitest';
import { gameAudio, installAudioInput } from '../src/audio/engine';
import { NICKNAME_MAX, normalizeNickname, type LobbyMsg } from '@dorandi/logic';
import { renderEntry } from '../src/online/entry';
import { lobbyModel, renderLobby, type LobbyActions } from '../src/online/lobby';
import { joinErrorText, TEXT } from '../src/online/text';
import { difficultyRuleText } from '../src/ui/difficulty';
import { firstVisitRules } from '../src/ui/first-visit';

describe('entry and lobby', () => {
  test('join error texts', () => {
    expect(joinErrorText(4102)).toBe('방에 같은 닉네임이 있습니다');
    expect(joinErrorText(4103)).toBe('가득 찬 방입니다');
    expect(joinErrorText(522)).toBe('없거나 끝난 방입니다');
    expect(joinErrorText(9999)).toBe('서버에 연결하지 못했습니다');
  });
  test('lobby model', () => {
    const m = lobbyModel({ roomId: 'r', you: 2, hostSeat: 1, seats: [{ seat: 1, name: '가', ready: true }, { seat: 2, name: '나', ready: false }] });
    expect(m.rows.length).toBe(6);
    expect(m.rows[0]).toMatchObject({ text: '1번 가', host: true, ready: true, me: false });
    expect(m.rows[1]).toMatchObject({ text: '2번 나', me: true, ready: false });
    expect(m.rows[2]).toMatchObject({ empty: true, text: '빈 자리' });
    expect(m).toMatchObject({ isHost: false, myReady: false, canStart: false });
  });
  test('lobby model: the host never readies, the hint counts the guests', () => {
    const seats = (...r: boolean[]) => r.map((ready, i) => ({ seat: i + 1, name: `p${i + 1}`, ready }));
    const alone = lobbyModel({ roomId: 'r', you: 1, hostSeat: 1, seats: seats(false) });
    expect(alone).toMatchObject({ canStart: true, hint: '혼자 시작합니다 · 시작하면 더 들어올 수 없습니다' });
    expect(alone.rows[0]!.showState).toBe(false);
    const waiting = lobbyModel({ roomId: 'r', you: 1, hostSeat: 1, seats: seats(false, true, false) });
    expect(waiting).toMatchObject({ canStart: false, guests: 2, readyGuests: 1, hint: '모두 준비하면 시작할 수 있습니다 · 1/2명 준비' });
    expect(lobbyModel({ roomId: 'r', you: 1, hostSeat: 1, seats: seats(false, true, true) }))
      .toMatchObject({ canStart: true, hint: '3명으로 시작합니다 · 시작하면 더 들어올 수 없습니다' });
    expect(lobbyModel({ roomId: 'r', you: 1, hostSeat: 1, seats: seats(false, true, true, true, true, true) }))
      .toMatchObject({ canStart: true, hint: '' });
    const guest = lobbyModel({ roomId: 'r', you: 2, hostSeat: 1, seats: seats(false, false) });
    expect(guest).toMatchObject({ isHost: false, canStart: false, hint: '' });
    expect(guest.rows[1]!.showState).toBe(true);
  });
  test('submitting twice (Enter during IME, double click) sends one join (review focus 5)', async () => {
    const root = document.createElement('div');
    let calls = 0; let release!: () => void;
    renderEntry(root, { onSubmit: () => { calls++; return new Promise<void>(r => { release = r; }); } });
    const input = root.querySelector('input')!; input.value = '가나';
    const form = root.querySelector('form')!;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    root.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    expect(calls).toBe(1); release();
  });
  test('the name box stops at the length the hint and the server allow', () => {
    const root = document.createElement('div');
    renderEntry(root, { onSubmit: () => Promise.resolve() });
    const input = root.querySelector('input')!;
    expect(input.maxLength).toBe(NICKNAME_MAX);
    expect(TEXT.namePlaceholder).toContain(`1~${NICKNAME_MAX}자`);
    expect(TEXT.badName).toContain(`1~${NICKNAME_MAX}자`);
    expect(normalizeNickname('가'.repeat(NICKNAME_MAX))).not.toBeNull();
    expect(normalizeNickname('가'.repeat(NICKNAME_MAX + 1))).toBeNull();
  });
  test('Enter that only commits an IME composition does not submit; a plain Enter still does', () => {
    const root = document.createElement('div');
    renderEntry(root, { onSubmit: () => Promise.resolve() });
    const input = root.querySelector('input')!;
    const enter = (init: KeyboardEventInit) => {
      const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...init });
      input.dispatchEvent(ev);
      return ev.defaultPrevented;
    };
    expect(enter({ isComposing: true })).toBe(true);
    expect(enter({ keyCode: 229 })).toBe(true);
    expect(enter({})).toBe(false);
  });

  test('the normal solo link can reuse this page, while a modified click keeps link navigation', () => {
    const root = document.createElement('div');
    const routes: string[] = [];
    renderEntry(root, { onSubmit: () => Promise.resolve(), onSolo: href => routes.push(href) });
    const link = root.querySelector('a.entry-solo')!;
    const click = (ctrlKey: boolean) => link.dispatchEvent(new MouseEvent('click', { ctrlKey, cancelable: true }));
    expect(click(true)).toBe(true);
    expect(click(false)).toBe(false);
    expect(routes).toEqual([expect.stringContaining('/solo?rounds=70&difficulty=normal')]);
  });

  test('a first visit opens 처음이라면 with the five rules; a remembered name keeps it folded', () => {
    const root = document.createElement('div');
    renderEntry(root, { onSubmit: async () => {} });
    const first = root.querySelector<HTMLDetailsElement>('details.entry-first')!;
    expect(first.open).toBe(true);
    expect(first.querySelector('summary')!.textContent).toBe('처음이라면');
    const rules = Array.from(first.querySelectorAll('ul.entry-rules > li')).map(li => li.textContent);
    expect(rules).toHaveLength(5);
    expect(rules).toEqual(firstVisitRules());
    expect(root.querySelector('p.entry-tagline')!.textContent).toBe('최대 6명이 함께 잡귀를 막는 협동 랜덤 디펜스');
    expect(Array.from(root.querySelector('.screen-box')!.children).map(c => c.className))
      .toEqual(['screen-title', 'entry-tagline', 'entry-first', 'entry-form', 'entry-credits']);
    renderEntry(root, { name: '하나', onSubmit: async () => {} });
    expect(root.querySelector<HTMLDetailsElement>('details.entry-first')!.open).toBe(false);
  });

  test('one difficulty row sits above both buttons, and the solo button follows the pick', () => {
    const root = document.createElement('div');
    renderEntry(root, { onSubmit: async () => {} });
    const form = root.querySelector('form')!;
    expect(Array.from(form.children).map(c => c.className))
      .toEqual(['entry-label', 'entry-difficulty-block', 'screen-actions entry-actions', 'entry-error']);
    expect(root.querySelectorAll('.entry-difficulty')).toHaveLength(1);
    const actions = form.querySelector('.entry-actions')!;
    expect(Array.from(actions.children).map(c => [c.tagName, c.textContent])).toEqual([['BUTTON', '방 만들기'], ['A', '혼자 하기']]);
    expect(actions.querySelector('button')!.type).toBe('submit');
    expect(actions.querySelector('a')!.className).toBe('big secondary entry-solo');
    root.querySelector<HTMLButtonElement>('[data-difficulty="hard"]')!.click();
    expect(root.querySelector<HTMLAnchorElement>('a.entry-solo')!.getAttribute('href')).toBe('/solo?rounds=70&difficulty=hard');
    expect(root.querySelector('.entry-difficulty-block .difficulty-note')!.textContent).toBe(difficultyRuleText('hard'));
    expect(root.querySelectorAll('a.entry-solo')).toHaveLength(1);
  });

  test('the invite screen has no difficulty row and no solo button, and a way home', () => {
    const root = document.createElement('div');
    renderEntry(root, { roomId: 'r1', onSubmit: async () => {} });
    expect(root.querySelector('[data-difficulty]')).toBeNull();
    expect(root.querySelector('a[href^="/solo"]')).toBeNull();
    expect(root.querySelector('p.entry-invite')!.textContent).toBe('초대받은 방에 들어갑니다 · 난이도는 방장이 정합니다');
    const form = root.querySelector('form')!;
    expect(Array.from(form.children).map(c => c.className)).toEqual(['entry-label', 'entry-invite', 'screen-actions entry-actions', 'entry-error']);
    expect(Array.from(form.querySelector('.entry-actions')!.children).map(c => c.outerHTML)).toEqual(['<button class="big" type="submit">입장하기</button>']);
    const home = root.querySelector<HTMLAnchorElement>('a.entry-home')!;
    expect([home.getAttribute('href'), home.textContent]).toEqual(['/', '처음 화면으로']);
    expect(root.querySelector('details.entry-first')).not.toBeNull();
    expect(Array.from(root.querySelector('.screen-box')!.children).map(c => c.className))
      .toEqual(['screen-title', 'entry-tagline', 'entry-first', 'entry-form', 'entry-home', 'entry-credits']);
  });

  test('a remembered name makes a room with one Enter (review focus 1)', async () => {
    const root = document.createElement('div');
    document.body.append(root);
    const sent: [string, string][] = [];
    renderEntry(root, { name: '하나', onSubmit: async (name, difficulty) => { sent.push([name, difficulty]); } });
    const submit = root.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(document.activeElement).toBe(submit);
    expect(Array.from(root.querySelectorAll<HTMLButtonElement>('form button')).filter(b => b.type === 'submit')).toEqual([submit]);
    (document.activeElement as HTMLButtonElement).click();
    await Promise.resolve();
    expect(sent).toEqual([['하나', 'normal']]);
    root.remove();
  });

  test('the solo button and the way home click like the buttons do', () => {
    installAudioInput();
    const play = vi.spyOn(gameAudio, 'play').mockImplementation(() => {});
    vi.spyOn(gameAudio, 'unlock').mockImplementation(() => {});
    const root = document.createElement('div');
    document.body.append(root);
    const press = (sel: string) => root.querySelector(sel)!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
    renderEntry(root, { name: '하나', onSubmit: async () => {} });
    press('a.entry-solo');
    renderEntry(root, { roomId: 'r1', name: '하나', onSubmit: async () => {} });
    press('a.entry-home');
    expect(play.mock.calls).toEqual([['click'], ['click']]);
    root.remove();
    vi.restoreAllMocks();
  });
});

describe('the ready room buttons (design 3-2, 3-5, 3-6, 3-7)', () => {
  const seats = (...r: boolean[]) => r.map((ready, i) => ({ seat: i + 1, name: `p${i + 1}`, ready }));
  const lobby = (you: number, ...r: boolean[]): LobbyMsg => ({ roomId: 'r', you, hostSeat: 1, seats: seats(...r), stage: 'stage3', difficulty: 'normal' });
  const noop: LobbyActions = { ready() {}, start() {}, copy: async () => true, leave() {} };
  const draw = (msg: LobbyMsg, actions: Partial<LobbyActions> = {}) => {
    const root = document.createElement('div');
    renderLobby(root, msg, { ...noop, ...actions });
    return root;
  };
  const bigs = (root: HTMLElement) => Array.from(root.querySelectorAll<HTMLButtonElement>('.screen-actions button'));
  const hint = (root: HTMLElement) => root.querySelector('.lobby-hint.lobby-start-hint');

  test('the host has one gold 시작, lit once every guest is ready', () => {
    const waiting = draw(lobby(1, false, false));
    const [start, ...rest] = bigs(waiting);
    expect(rest).toHaveLength(0);
    expect(start!.textContent).toBe(TEXT.start);
    expect(start!.classList.contains('big')).toBe(true);
    expect(start!.classList.contains('secondary')).toBe(false);
    expect(start!.disabled).toBe(true);
    expect(hint(waiting)?.textContent).toBe('모두 준비하면 시작할 수 있습니다 · 0/1명 준비');
    const rows = waiting.querySelectorAll('.lobby-row');
    expect(rows[0]!.querySelector('.lobby-state')).toBeNull();
    expect(rows[1]!.querySelector('.lobby-state')?.textContent).toBe(TEXT.waiting);

    const alone = draw(lobby(1, false));
    expect(bigs(alone).map(b => [b.textContent, b.disabled])).toEqual([[TEXT.start, false]]);
    expect(hint(alone)?.textContent).toBe('혼자 시작합니다 · 시작하면 더 들어올 수 없습니다');

    const full = draw(lobby(1, false, true, true, true, true, true));
    expect(bigs(full).map(b => b.disabled)).toEqual([false]);
    expect(hint(full)).not.toBeNull();
    expect(hint(full)!.textContent).toBe('');
  });

  test('the host start button calls start, never ready', () => {
    const calls: string[] = [];
    const root = draw(lobby(1, false), { start: () => calls.push('start'), ready: () => calls.push('ready') });
    bigs(root)[0]!.click();
    expect(calls).toEqual(['start']);
  });

  test('a guest readies with gold 준비 and backs out with a plain 준비 취소', () => {
    const picks: boolean[] = [];
    const before = draw(lobby(2, false, false), { ready: v => picks.push(v) });
    expect(bigs(before).map(b => [b.textContent, b.classList.contains('secondary')])).toEqual([[TEXT.readyBtn, false]]);
    bigs(before)[0]!.click();
    const after = draw(lobby(2, false, true), { ready: v => picks.push(v) });
    expect(bigs(after).map(b => [b.textContent, b.classList.contains('secondary')])).toEqual([[TEXT.unreadyBtn, true]]);
    bigs(after)[0]!.click();
    expect(picks).toEqual([true, false]);
    expect(after.textContent).not.toContain(TEXT.start);
    expect(hint(after)?.textContent).toBe('');
    expect(after.textContent).toContain(TEXT.modeHostOnly);
  });

  test('나가기 sits by 링크 복사 and calls leave', () => {
    let left = 0;
    const root = draw(lobby(1, false), { leave: () => { left++; } });
    const tools = root.querySelector('.lobby-tools')!;
    expect(Array.from(tools.children).map(c => c.textContent)).toEqual([TEXT.copy, TEXT.leave]);
    tools.querySelector<HTMLButtonElement>('button:last-child')!.click();
    expect(left).toBe(1);
  });
});

