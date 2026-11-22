import { difficultyPicker } from '../ui/difficulty';
import { normalizeNickname, type Difficulty } from '@dorandi/logic';
import { TEXT } from './text';

export interface EntryOptions {
  roomId?: string;
  name?: string;
  error?: string;
  onSubmit(name: string): Promise<void>;
}

/** Query that opens the solo page on the 60-round data. */
export const SOLO_LONG_QUERY = 'rounds=60';

/** Solo rule data from the page query: the 60-round game on `?rounds=60`, else the old 20-round solo game. */
export function soloStage(search: string): 'stage1' | 'stage3' {
  return new URLSearchParams(search).get('rounds') === '60' ? 'stage3' : 'stage1';
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
  box.append(el('h1', 'screen-title', TEXT.title));

  const form = el('form', 'entry-form');
  const label = el('label', 'entry-label', TEXT.nameLabel);
  const input = el('input', 'entry-input');
  input.type = 'text';
  input.maxLength = 12;
  input.autocomplete = 'off';
  input.placeholder = TEXT.namePlaceholder;
  input.value = opts.name ?? '';
  label.append(input);
  const button = el('button', 'big', opts.roomId ? TEXT.join : TEXT.create);
  button.type = 'submit';
  const message = el('div', 'entry-error');
  message.setAttribute('role', 'alert');
  message.textContent = opts.error ?? '';
  form.append(label, button, message);

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
      message.textContent = TEXT.badName;
      return;
    }
    message.textContent = '';
    setBusy(true);
    let pending: Promise<void>;
    try {
      pending = opts.onSubmit(name);
    } catch (err) {
      pending = Promise.reject(err);
    }
    pending
      .catch(() => { message.textContent = TEXT.connectFail; })
      .finally(() => { if (button.isConnected) setBusy(false); });
  });

  box.append(form);
  // solo is the 60-round game; the 20-round data stays reachable only through an old /solo link
  const solo = el('div', 'entry-solo');
  const link = el('a', 'entry-link', TEXT.solo);
  let difficulty: Difficulty = 'normal';
  function drawSolo(): void {
    solo.replaceChildren(difficultyPicker(difficulty, d => { difficulty = d; drawSolo(); }));
    link.href = `/solo?${SOLO_LONG_QUERY}&difficulty=${difficulty}`;
    solo.append(link);
  }
  drawSolo();
  box.append(solo);
  root.append(box);
  if (!opts.name) input.focus();
}
