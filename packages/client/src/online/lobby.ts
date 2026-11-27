import { difficultyNote, difficultyPicker } from '../ui/difficulty';
import type { Difficulty, LobbyMsg, MatchStage } from '@dorandi/logic';
import { artLoadText, startFewText, startHintText, TEXT } from './text';

export const SEATS = 6;

export interface LobbyRow { seat: number; text: string; host: boolean; ready: boolean; me: boolean; empty: boolean; showState: boolean }
export interface LobbyModel {
  rows: LobbyRow[]; canStart: boolean; isHost: boolean; myReady: boolean; hint: string;
  guests: number; readyGuests: number; difficulty?: Difficulty; stage: MatchStage;
  /** Every file the page warmed has settled; 0 of 0 (nothing warmed) counts as done. */
  artReady: boolean; artPct: number;
}

export interface ArtProgress { done: number; total: number }

export function lobbyModel(msg: LobbyMsg, art: ArtProgress = { done: 0, total: 0 }): LobbyModel {
  const rows: LobbyRow[] = [];
  for (let seat = 1; seat <= SEATS; seat++) {
    const s = msg.seats.find(x => x.seat === seat);
    rows.push(s
      ? { seat, text: `${seat}번 ${s.name}`, host: msg.hostSeat === seat, ready: s.ready, me: msg.you === seat, empty: false, showState: msg.hostSeat !== seat }
      : { seat, text: TEXT.emptySeat, host: false, ready: false, me: false, empty: true, showState: false });
  }
  const isHost = msg.hostSeat === msg.you;
  const guestSeats = msg.seats.filter(s => s.seat !== msg.hostSeat);
  const guests = guestSeats.length;
  const readyGuests = guestSeats.filter(s => s.ready).length;
  const artReady = art.done >= art.total;
  const artPct = art.total ? Math.floor((art.done / art.total) * 100) : 100;
  const allReady = readyGuests === guests;
  const canStart = isHost && allReady && artReady;
  const players = msg.seats.length;
  const hint = !isHost ? '' : !allReady ? startHintText(readyGuests, guests) : !artReady ? TEXT.artWaitStart : players < SEATS ? startFewText(players) : '';
  return {
    rows,
    canStart,
    isHost,
    myReady: msg.seats.find(s => s.seat === msg.you)?.ready ?? false,
    hint,
    guests,
    readyGuests,
    difficulty: msg.stage === 'stage3' ? msg.difficulty ?? 'normal' : undefined,
    stage: msg.stage ?? 'stage2',
    artReady,
    artPct,
  };
}

/** `copy` resolves true only when the clipboard took the address. */
export interface LobbyActions { ready(v: boolean): void; start(): void; leave(): void; copy(): Promise<boolean>; difficulty?(d: Difficulty): void }

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** `link` is the room address shown as a text box to copy by hand, once the clipboard has failed. */
export function renderLobby(root: HTMLElement, msg: LobbyMsg, actions: LobbyActions, notice?: string, link?: string, art?: ArtProgress): void {
  const m = lobbyModel(msg, art);
  root.replaceChildren();
  const box = el('div', 'screen-box lobby');
  box.append(el('h1', 'screen-title', TEXT.lobbyTitle));

  const copy = el('button', undefined, TEXT.copy);
  copy.type = 'button';
  copy.addEventListener('click', () => {
    void actions.copy().then(ok => {
      if (!ok) return;
      copy.textContent = TEXT.copied;
      setTimeout(() => { copy.textContent = TEXT.copy; }, 1500);
    });
  });
  const leave = el('button', undefined, TEXT.leave);
  leave.type = 'button';
  leave.addEventListener('click', () => actions.leave());
  const tools = el('div', 'lobby-tools');
  tools.append(copy, leave);
  box.append(tools);
  if (link !== undefined) {
    const field = el('input', 'entry-input lobby-link');
    field.type = 'text';
    field.readOnly = true;
    field.value = link;
    field.setAttribute('aria-label', TEXT.linkLabel);
    field.addEventListener('focus', () => field.select());
    box.append(el('div', 'lobby-hint', TEXT.copyByHand), field);
  }

  // new rooms are 70 rounds and the host picks the difficulty; a 20-round room from an old client only says so
  const modes = el('div', 'lobby-modes');
  modes.setAttribute('role', 'group');
  modes.setAttribute('aria-label', TEXT.modeLabel);
  if (m.difficulty) {
    modes.append(el('span', 'lobby-mode-label', TEXT.modeLabel), difficultyPicker(m.difficulty, m.isHost ? actions.difficulty : undefined));
  } else modes.append(el('span', 'lobby-mode-label', TEXT.legacyMode));
  box.append(modes);
  if (m.difficulty) box.append(difficultyNote(m.difficulty));
  if (!m.isHost && m.difficulty) box.append(el('div', 'lobby-hint', TEXT.modeHostOnly));

  const list = el('ul', 'lobby-rows');
  for (const r of m.rows) {
    const li = el('li', r.empty ? 'lobby-row empty' : 'lobby-row');
    li.append(el('span', 'lobby-name', r.text));
    if (r.host) li.append(el('em', undefined, TEXT.host));
    if (r.me) li.append(el('em', undefined, TEXT.me));
    if (r.showState) li.append(el('span', r.ready ? 'lobby-state on' : 'lobby-state', r.ready ? TEXT.ready : TEXT.waiting));
    list.append(li);
  }
  box.append(list);
  if (!m.artReady && art) {
    const load = el('div', 'lobby-load', artLoadText(m.artPct, art.done, art.total));
    const bar = el('div', 'lobby-load-bar');
    const fill = el('i');
    fill.style.width = `${m.artPct}%`;
    bar.append(fill);
    load.append(bar);
    box.append(load);
  }

  const controls = el('div', 'screen-actions');
  if (m.isHost) {
    const start = el('button', 'big', TEXT.start);
    start.type = 'button';
    start.disabled = !m.canStart;
    start.addEventListener('click', () => actions.start());
    controls.append(start);
  } else {
    // a guest can only say ready with the art in, so a started match never waits on anyone's download
    const loading = !m.myReady && !m.artReady;
    const ready = el('button', m.myReady ? 'big secondary' : 'big', m.myReady ? TEXT.unreadyBtn : loading ? TEXT.artWaitReady : TEXT.readyBtn);
    ready.type = 'button';
    ready.disabled = loading;
    ready.addEventListener('click', () => actions.ready(!m.myReady));
    controls.append(ready);
  }
  box.append(controls, el('div', 'lobby-hint lobby-start-hint', m.hint));
  if (notice) box.append(el('div', 'entry-error', notice));
  root.append(box);
}
