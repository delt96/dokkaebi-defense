import { difficultyNote, difficultyPicker } from '../ui/difficulty';
import { firstVisitRules } from '../ui/first-visit';
import { gameAudio } from '../audio/engine';
import { musicCreditsHtml } from '../audio/settings-ui';
import { NICKNAME_MAX, normalizeNickname, type Difficulty } from '@dorandi/logic';
import { TEXT } from './text';

export interface EntryOptions {
  roomId?: string;
  name?: string;
  error?: string;
  onSolo?(href: string): void;
  /** `difficulty`: the pick on the start screen; a new room starts with it (joining keeps the host's). */
  onSubmit(name: string, difficulty: Difficulty): Promise<void>;
}

/** Query that opens the solo page on the 70-round data. */
export const SOLO_LONG_QUERY = 'rounds=70';

/** Solo rule data from the page query: the 70-round game on `?rounds=70` (or an older `?rounds=60` link), else the old 20-round solo game. */
export function soloStage(search: string): 'stage1' | 'stage3' {
  const rounds = new URLSearchParams(search).get('rounds');
  return rounds === '70' || rounds === '60' ? 'stage3' : 'stage1';
}

/** True when a key event came from a text field, so game hotkeys must ignore it. */
export function isTypingTarget(ev: Event): boolean {
  const t = ev.target as { tagName?: string; isContentEditable?: boolean } | null;
  if (!t || typeof t.tagName !== 'string') return false;
  const tag = t.tagName.toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable === true;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function renderEntry(root: HTMLElement, opts: EntryOptions): void {
  root.replaceChildren();
  const box = el('div', 'screen-box');
  const first = el('details', 'entry-first');
  // decided before the box is attached, so a first visit never flashes folded
  first.open = !opts.name;
  const rules = el('ul', 'entry-rules');
  rules.append(...firstVisitRules().map(rule => el('li', undefined, rule)));
  first.append(el('summary', undefined, TEXT.firstTime), rules);
  box.append(el('h1', 'screen-title', TEXT.title), el('p', 'entry-tagline', TEXT.tagline), first);

  const form = el('form', 'entry-form');
  const label = el('label', 'entry-label', TEXT.nameLabel);
  const input = el('input', 'entry-input');
  input.type = 'text';
  input.maxLength = NICKNAME_MAX;
  input.autocomplete = 'off';
  input.placeholder = TEXT.namePlaceholder;
  input.value = opts.name ?? '';
  label.append(input);
  const button = el('button', 'big', opts.roomId ? TEXT.join : TEXT.create);
  button.type = 'submit';
  const actions = el('div', 'screen-actions entry-actions');
  actions.append(button);
  const message = el('div', 'entry-error');
  message.setAttribute('role', 'alert');
  message.textContent = opts.error ?? '';

  let difficulty: Difficulty = 'normal';
  let busy = false;
  const setBusy = (v: boolean): void => {
    busy = v;
    button.disabled = v;
  };

  // Enter while an IME composition is still open only commits the text; it must not submit.
  input.addEventListener('keydown', ev => {
    if (ev.key === 'Enter' && (ev.isComposing || ev.keyCode === 229)) ev.preventDefault();
  });

  form.addEventListener('submit', ev => {
    ev.preventDefault();
    if (busy) return;
    const name = normalizeNickname(input.value);
    if (name === null) {
      gameAudio.play('error');
      message.textContent = TEXT.badName;
      return;
    }
    message.textContent = '';
    setBusy(true);
    let pending: Promise<void>;
    try {
      pending = opts.onSubmit(name, difficulty);
    } catch (err) {
      pending = Promise.reject(err);
    }
    pending
      .catch(() => { gameAudio.play('error'); message.textContent = TEXT.connectFail; })
      .finally(() => { if (button.isConnected) setBusy(false); });
  });

  if (opts.roomId) {
    form.append(label, el('p', 'entry-invite', TEXT.inviteNote), actions, message);
    const home = el('a', 'entry-home', TEXT.home);
    home.href = '/';
    box.append(form, home);
  } else {
    // solo is the 70-round game; the 20-round data stays reachable only through an old /solo link
    const solo = el('a', 'big secondary entry-solo', TEXT.solo);
    solo.addEventListener('click', ev => {
      if (!opts.onSolo || ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      ev.preventDefault();
      opts.onSolo(solo.href);
    });
    actions.append(solo);
    const block = el('div', 'entry-difficulty-block');
    const drawDifficulty = (): void => {
      const row = el('div', 'entry-difficulty');
      row.append(el('span', 'entry-difficulty-label', TEXT.modeLabel), difficultyPicker(difficulty, d => { difficulty = d; drawDifficulty(); }));
      block.replaceChildren(row, difficultyNote(difficulty));
      solo.href = `/solo?${SOLO_LONG_QUERY}&difficulty=${difficulty}`;
    };
    drawDifficulty();
    form.append(label, block, actions, message);
    box.append(form);
  }
  const footer = el('footer', 'entry-credits');
  footer.innerHTML = musicCreditsHtml();
  box.append(footer);
  root.append(box);
  // a remembered name goes straight to the submit button: one Enter makes the room
  (opts.name ? button : input).focus();
}
