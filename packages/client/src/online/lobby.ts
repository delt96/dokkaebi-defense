import { difficultyPicker } from '../ui/difficulty';
import type { Difficulty, LobbyMsg, MatchStage } from '@dorandi/logic';
import { TEXT } from './text';

const SEATS = 6;

export interface LobbyRow { seat: number; text: string; host: boolean; ready: boolean; me: boolean; empty: boolean }
export interface LobbyModel { rows: LobbyRow[]; canStart: boolean; isHost: boolean; myReady: boolean; hint: string | null; difficulty?: Difficulty; stage: MatchStage }

export function lobbyModel(msg: LobbyMsg): LobbyModel {
  const rows: LobbyRow[] = [];
  for (let seat = 1; seat <= SEATS; seat++) {
    const s = msg.seats.find(x => x.seat === seat);
    rows.push(s
      ? { seat, text: `${seat}번 ${s.name}`, host: msg.hostSeat === seat, ready: s.ready, me: msg.you === seat, empty: false }
      : { seat, text: TEXT.emptySeat, host: false, ready: false, me: false, empty: true });
  }
  const isHost = msg.hostSeat === msg.you;
  const canStart = isHost && msg.seats.length > 0 && msg.seats.every(s => s.ready);
  return {
    rows,
    canStart,
    isHost,
    myReady: msg.seats.find(s => s.seat === msg.you)?.ready ?? false,
    hint: isHost && !canStart ? TEXT.startHint : null,
    difficulty: msg.stage === 'stage3' ? msg.difficulty ?? 'normal' : undefined,
    stage: msg.stage ?? 'stage2',
  };
}

export interface LobbyActions { ready(v: boolean): void; start(): void; copy(): void; difficulty?(d: Difficulty): void; stage?(stage: MatchStage): void }

const STAGE_CHOICES: { stage: MatchStage; text: string }[] = [
  { stage: 'stage2', text: TEXT.mode20 },
  { stage: 'stage3', text: TEXT.mode60 },
];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function renderLobby(root: HTMLElement, msg: LobbyMsg, actions: LobbyActions, notice?: string): void {
  const m = lobbyModel(msg);
  root.replaceChildren();
  const box = el('div', 'screen-box lobby');
  box.append(el('h1', 'screen-title', TEXT.lobbyTitle));

  const copy = el('button', undefined, TEXT.copy);
  copy.type = 'button';
  copy.addEventListener('click', () => {
    actions.copy();
    copy.textContent = TEXT.copied;
    setTimeout(() => { copy.textContent = TEXT.copy; }, 1500);
  });
  box.append(copy);

  // the host picks the round count; everyone else sees the pick
  const modes = el('div', 'lobby-modes');
  modes.setAttribute('role', 'group');
  modes.setAttribute('aria-label', TEXT.modeLabel);
  modes.append(el('span', 'lobby-mode-label', TEXT.modeLabel));
  for (const c of STAGE_CHOICES) {
    const on = m.stage === c.stage;
    const b = el('button', on ? 'lobby-mode on' : 'lobby-mode', c.text);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(on));
    b.dataset.stage = c.stage;
    if (!m.isHost) b.disabled = true;
    else if (!on) b.addEventListener('click', () => actions.stage?.(c.stage));
    modes.append(b);
  }
  if (m.difficulty) modes.append(difficultyPicker(m.difficulty, m.isHost ? actions.difficulty : undefined));
  box.append(modes);
  if (!m.isHost) box.append(el('div', 'lobby-hint', TEXT.modeHostOnly));

  const list = el('ul', 'lobby-rows');
  for (const r of m.rows) {
    const li = el('li', r.empty ? 'lobby-row empty' : 'lobby-row');
    li.append(el('span', 'lobby-name', r.text));
    if (r.host) li.append(el('em', undefined, TEXT.host));
    if (r.me) li.append(el('em', undefined, TEXT.me));
    if (!r.empty) li.append(el('span', r.ready ? 'lobby-state on' : 'lobby-state', r.ready ? TEXT.ready : TEXT.waiting));
    list.append(li);
  }
  box.append(list);

  const ready = el('button', 'big', m.myReady ? TEXT.unreadyBtn : TEXT.readyBtn);
  ready.type = 'button';
  ready.addEventListener('click', () => actions.ready(!m.myReady));
  const controls = el('div', 'screen-actions');
  box.append(controls);
  controls.append(ready);

  if (m.isHost) {
    const start = el('button', 'big', TEXT.start);
    start.type = 'button';
    start.disabled = !m.canStart;
    start.addEventListener('click', () => actions.start());
    controls.append(start);
  }
  if (m.hint) box.append(el('div', 'lobby-hint', m.hint));
  if (notice) box.append(el('div', 'entry-error', notice));
  root.append(box);
}
