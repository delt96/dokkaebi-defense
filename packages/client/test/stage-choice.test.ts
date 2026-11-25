// @vitest-environment happy-dom
import { describe, expect, test } from 'vitest';
import { createGame, loadGameData, canonicalJson, fnv1a, type LobbyMsg } from '@dorandi/logic';
import { knownDataVersions, matchDataVersion, NetClient, stage2DataVersion, stageOfVersion } from '../src/net/NetClient';
import type { RoomLike } from '../src/net/room';
import { renderEntry, soloStage } from '../src/online/entry';
import { lobbyModel, renderLobby } from '../src/online/lobby';
import { hudModel } from '../src/ui/models';
import { fixtureFull } from './fixtures/net';

const msg = (over: Partial<LobbyMsg> = {}): LobbyMsg => ({
  roomId: 'r', you: 1, hostSeat: 1, seats: [{ seat: 1, name: '가', ready: false }, { seat: 2, name: '나', ready: false }], ...over,
});

class Room implements RoomLike {
  roomId = 'room-1';
  sent: { type: string; msg: unknown }[] = [];
  handlers = new Map<string, (m: any) => void>();
  send(type: string, m?: unknown): void { this.sent.push({ type, msg: m }); }
  onMessage(type: string, cb: (m: any) => void): void { this.handlers.set(type, cb); }
  onLeave(): void {}
  async leave(): Promise<void> {}
}

describe('60 rounds only on screen; 20-round rooms still load', () => {
  test('lobby: no round-count choice, the host picks the difficulty, guests see it', () => {
    expect(lobbyModel(msg()).stage).toBe('stage2');
    expect(lobbyModel(msg({ stage: 'stage3' })).stage).toBe('stage3');
    const picks: string[] = [];
    const root = document.createElement('div');
    renderLobby(root, msg({ stage: 'stage3' }), { ready: () => {}, start: () => {}, leave: () => {}, copy: async () => true, difficulty: d => picks.push(d) });
    expect(root.querySelector('.lobby-mode, [data-stage]')).toBeNull();
    expect(root.textContent).not.toContain('20라운드');
    expect(root.textContent).not.toContain('시험판');
    expect(root.querySelector('[data-difficulty="normal"]')?.getAttribute('aria-pressed')).toBe('true');
    root.querySelector<HTMLButtonElement>('[data-difficulty="hard"]')!.click();
    expect(picks).toEqual(['hard']);

    const guest = document.createElement('div');
    renderLobby(guest, msg({ you: 2, stage: 'stage3' }), { ready: () => {}, start: () => {}, leave: () => {}, copy: async () => true });
    const gb = Array.from(guest.querySelectorAll<HTMLButtonElement>('[data-difficulty]'));
    expect(gb).toHaveLength(3);
    expect(gb.every(b => b.disabled)).toBe(true);
    expect(guest.textContent).toContain('난이도는 방장이 정합니다');
  });

  test('lobby: a 20-round room made by an old client says so and offers no switch', () => {
    const root = document.createElement('div');
    renderLobby(root, msg(), { ready: () => {}, start: () => {}, leave: () => {}, copy: async () => true });
    expect(root.querySelector('button.lobby-mode, [data-stage], [data-difficulty]')).toBeNull();
    expect(root.querySelector('.lobby-modes')?.textContent).toBe('20라운드 방');
  });

  test('the client sends the pick and plays either data version', () => {
    const room = new Room();
    const net = new NetClient(room, knownDataVersions());
    net.setStage('stage3');
    expect(room.sent).toEqual([{ type: 'stage', msg: { stage: 'stage3' } }]);
    // a ready names the round count it was pressed for, so the server can drop one that crossed a switch
    net.ready(true, 'stage3');
    net.ready(false);
    expect(room.sent.slice(1)).toEqual([{ type: 'ready', msg: { ready: true, stage: 'stage3' } }, { type: 'ready', msg: { ready: false } }]);
    expect(knownDataVersions().slice(0, 2)).toEqual([stage2DataVersion(), matchDataVersion('stage3')]);
    expect(stageOfVersion(stage2DataVersion())).toBe('stage2');
    expect(stageOfVersion(matchDataVersion('stage3'))).toBe('stage3');
    expect(stageOfVersion('other')).toBeNull();
    const kinds: string[] = [];
    net.on(e => kinds.push(e.kind));
    room.handlers.get('full')!({ ...fixtureFull(), dataVersion: matchDataVersion('stage3') });
    expect(kinds).toEqual(['view']);
    room.handlers.get('full')!({ ...fixtureFull(), dataVersion: 'other' });
    expect(kinds).toEqual(['view', 'versionMismatch']);
  });

  test('solo: the entry page shows only the 70-round difficulty buttons; old ?rounds=60 links still pick the data', () => {
    expect(soloStage('')).toBe('stage1');
    expect(soloStage('?rounds=20')).toBe('stage1');
    expect(soloStage('?rounds=60')).toBe('stage3');
    expect(soloStage('?rounds=70')).toBe('stage3');
    const root = document.createElement('div');
    renderEntry(root, { onSubmit: async () => {} });
    expect(root.querySelector('[data-rounds], .lobby-mode')).toBeNull();
    expect(root.textContent).not.toContain('시험판');
    expect(root.querySelector('[data-difficulty="normal"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(root.querySelector('a')?.getAttribute('href')).toBe('/solo?rounds=70&difficulty=normal');
    expect(root.querySelector('a')?.textContent).toBe('혼자 하기');
    root.querySelector<HTMLButtonElement>('[data-difficulty="hard"]')!.click();
    expect(root.querySelector('[data-difficulty="hard"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(root.querySelector('a')?.getAttribute('href')).toBe('/solo?rounds=70&difficulty=hard');
  });

  test('the start screen labels its difficulty row, and 방 만들기 uses the pick too', async () => {
    const picks: [string, string | undefined][] = [];
    const root = document.createElement('div');
    renderEntry(root, { onSubmit: async (name, difficulty) => { picks.push([name, difficulty]); } });
    const row = root.querySelector('.entry-difficulty')!;
    expect(row.firstElementChild!.textContent).toBe('난이도');
    expect(row.querySelectorAll('[data-difficulty]')).toHaveLength(3);
    root.querySelector<HTMLButtonElement>('[data-difficulty="easy"]')!.click();
    root.querySelector<HTMLInputElement>('.entry-input')!.value = '하나';
    root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve();
    expect(picks).toEqual([['하나', 'easy']]);
  });

  test('stage three shows the room choice to guests and on the HUD', () => {
    const message = msg({ stage: 'stage3', you: 2, difficulty: 'easy' });
    expect(lobbyModel(message).difficulty).toBe('easy');
    const root = document.createElement('div');
    renderLobby(root, message, { ready() {}, start() {}, leave() {}, async copy() { return true; } });
    expect(root.querySelector<HTMLButtonElement>('[data-difficulty="easy"]')?.disabled).toBe(true);
    expect(hudModel(createGame(loadGameData('stage3'), 1, 'easy')).roundText).toContain('쉬움');
  });

  test('difficulty and ready messages carry the host pick the player saw', () => {
    const room = new Room();
    const net = new NetClient(room, knownDataVersions());
    net.setDifficulty('hard');
    net.ready(true, 'stage3', 'hard');
    expect(room.sent).toEqual([
      { type: 'difficulty', msg: { difficulty: 'hard' } },
      { type: 'ready', msg: { ready: true, stage: 'stage3', difficulty: 'hard' } },
    ]);
  });

  test('previous stage three snapshot loads as normal', () => {
    const legacy = loadGameData('stage3');
    delete legacy.balance.defaultDifficulty;
    delete legacy.balance.difficulties;
    const dataVersion = fnv1a(canonicalJson(legacy, new Set()));
    const room = new Room();
    const net = new NetClient(room, knownDataVersions());
    room.handlers.get('full')!({ ...fixtureFull(), dataVersion });
    expect(net.view?.difficulty).toBe('normal');
    expect(stageOfVersion(dataVersion)).toBe('stage3');
  });
});
