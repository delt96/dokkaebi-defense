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

describe('20 or 60 rounds', () => {
  test('lobby shows the pick; only the host can change it', () => {
    expect(lobbyModel(msg()).stage).toBe('stage2');
    expect(lobbyModel(msg({ stage: 'stage3' })).stage).toBe('stage3');
    const picks: string[] = [];
    const root = document.createElement('div');
    renderLobby(root, msg(), { ready: () => {}, start: () => {}, copy: () => {}, stage: s => picks.push(s) });
    const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('.lobby-mode'));
    expect(buttons.map(b => b.textContent)).toEqual(['20라운드', '60라운드 (시험판)']);
    expect(buttons.map(b => b.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
    buttons[0]!.click(); buttons[1]!.click();
    expect(picks).toEqual(['stage3']);

    const guest = document.createElement('div');
    renderLobby(guest, msg({ you: 2, stage: 'stage3' }), { ready: () => {}, start: () => {}, copy: () => {}, stage: s => picks.push(s) });
    const gb = Array.from(guest.querySelectorAll<HTMLButtonElement>('.lobby-mode'));
    expect(gb.every(b => b.disabled)).toBe(true);
    expect(gb[1]!.getAttribute('aria-pressed')).toBe('true');
    expect(guest.textContent).toContain('판 길이는 방장이 정합니다');
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

  test('solo: the entry page links both lengths; only ?rounds=60 changes the data', () => {
    expect(soloStage('')).toBe('stage1');
    expect(soloStage('?rounds=20')).toBe('stage1');
    expect(soloStage('?rounds=60')).toBe('stage3');
    const root = document.createElement('div');
    renderEntry(root, { onSubmit: async () => {} });
    expect(root.querySelector('[data-difficulty]')).toBeNull();
    root.querySelector<HTMLButtonElement>('[data-rounds="60"]')!.click();
    expect(root.querySelector('[data-difficulty="normal"]')?.getAttribute('aria-pressed')).toBe('true');
    root.querySelector<HTMLButtonElement>('[data-difficulty="hard"]')!.click();
    expect(root.querySelector('a')?.getAttribute('href')).toBe('/solo?rounds=60&difficulty=hard');
    root.querySelector<HTMLButtonElement>('[data-rounds="20"]')!.click();
    expect(root.querySelector('[data-difficulty]')).toBeNull();
    expect(root.querySelector('a')?.getAttribute('href')).toBe('/solo');
  });

  test('stage three shows the room choice to guests and on the HUD', () => {
    const message = msg({ stage: 'stage3', you: 2, difficulty: 'easy' });
    expect(lobbyModel(message).difficulty).toBe('easy');
    const root = document.createElement('div');
    renderLobby(root, message, { ready() {}, start() {}, copy() {} });
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
