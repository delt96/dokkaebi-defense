import type { GambleTable, GameData, UpgradeId } from '@dorandi/logic';
import { esc } from './dom';
import { withJosa } from './josa';

export type NumKeyAction = `upgrade:${UpgradeId}` | `gambleCoins:${number}` | `gambleUnit:${GambleTable}`;
/** Nine slots; slot 0 is key 1. */
export type NumKeyMap = readonly (NumKeyAction | null)[];

export const DEFAULT_NUM_KEYS: NumKeyMap = [
  'upgrade:physical', 'upgrade:magical', 'upgrade:polish', 'gambleCoins:10', 'gambleCoins:100',
  'gambleUnit:small', 'gambleUnit:big', 'gambleUnit:coin', null,
];
export const NUM_KEY_CHOICES: readonly NumKeyAction[] = DEFAULT_NUM_KEYS.filter((a): a is NumKeyAction => a !== null);

export const NUM_KEY_HINT = '장터·강화 버튼을 Ctrl+클릭해도 바꿀 수 있습니다';
const STORAGE_KEY = 'dorandi.numKeys';
const SLOTS = 9;
const ACTION_RE = /^(upgrade:(physical|magical|polish)|gambleCoins:[1-9]\d*|gambleUnit:(small|big|coin))$/;
const UNIT_NAMES: Record<GambleTable, string> = { small: '보따리', big: '큰 보따리', coin: '엽전 보따리' };

const isAction = (v: unknown): v is NumKeyAction => typeof v === 'string' && ACTION_RE.test(v);

function local(): Storage | null {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

export function readNumKeys(storage: Storage | null = local()): NumKeyMap {
  let raw: unknown;
  try { raw = JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null'); } catch { return DEFAULT_NUM_KEYS; }
  if (!Array.isArray(raw) || raw.length !== SLOTS) return DEFAULT_NUM_KEYS;
  const seen = new Set<string>();
  return raw.map(v => {
    if (!isAction(v) || seen.has(v)) return null;
    seen.add(v);
    return v;
  });
}

export function writeNumKeys(map: NumKeyMap, storage: Storage | null = local()): void {
  try { storage?.setItem(STORAGE_KEY, JSON.stringify(map)); } catch { /* blocked storage: lasts for this page only */ }
}

export function assignNumKey(map: NumKeyMap, key: number, action: NumKeyAction | null): NumKeyMap {
  if (!Number.isInteger(key) || key < 1 || key > SLOTS) return map;
  return map.map((a, i) => (i === key - 1 ? action : action !== null && a === action ? null : a));
}

export function clearAction(map: NumKeyMap, action: NumKeyAction): NumKeyMap {
  return map.map(a => (a === action ? null : a));
}

export function keyOf(map: NumKeyMap, action: NumKeyAction): number | null {
  const i = map.indexOf(action);
  return i < 0 ? null : i + 1;
}

export function numKeyOfCode(code: string): number | null {
  const m = /^(?:Digit|Numpad)([1-9])$/.exec(code);
  return m ? Number(m[1]) : null;
}

export function splitAction(action: NumKeyAction): { action: 'upgrade' | 'gambleCoins' | 'gambleUnit'; arg: string } {
  const [kind, arg] = action.split(':') as ['upgrade' | 'gambleCoins' | 'gambleUnit', string];
  return { action: kind, arg };
}

export function actionOf(action: string, arg: string): NumKeyAction | null {
  const joined = `${action}:${arg}`;
  return isAction(joined) ? joined : null;
}

export function numKeyName(action: NumKeyAction, data: GameData): string {
  const { action: kind, arg } = splitAction(action);
  if (kind === 'upgrade') return data.upgrades.find(u => u.id === arg)?.label ?? arg;
  if (kind === 'gambleCoins') return `돈 도박 ${arg}냥`;
  return UNIT_NAMES[arg as GambleTable];
}

/** The 숫자키 row of the settings window; unfolded it lists keys 1-9 with a choice each. */
export function numKeysSettingsHtml(map: NumKeyMap, open: boolean, data: GameData): string {
  const head = `<div class="settings-row" data-setting="numKeys"><span>숫자키</span><div class="settings-choices">`
    + `<button data-action="numKeysFold" data-arg="" aria-expanded="${open}">${open ? '접기 ▴' : '펼치기 ▾'}</button></div></div>`;
  if (!open) return head;
  const rows = map.map((current, i) => {
    const options = [`<option value=""${current === null ? ' selected' : ''}>비움</option>`]
      .concat(NUM_KEY_CHOICES.map(a => `<option value="${a}"${a === current ? ' selected' : ''}>${esc(numKeyName(a, data))}</option>`));
    return `<label class="numkey-row"><b>${i + 1}</b><select data-numkey="${i + 1}" aria-label="숫자키 ${i + 1}">${options.join('')}</select></label>`;
  }).join('');
  return `${head}<div class="numkeys">${rows}<p class="numkeys-hint">${esc(NUM_KEY_HINT)}</p>`
    + '<div class="numkeys-foot"><button data-action="numKeysReset" data-arg="">처음대로</button></div></div>';
}

/** A `<select data-numkey>` value back to its action; '' and anything unknown are 비움. */
export function parseNumKeyAction(value: string): NumKeyAction | null {
  const [action = '', arg = ''] = value.split(':');
  return actionOf(action, arg);
}

/** The Ctrl+click question over a market or 강화 button: which key gets `action`. */
export function numKeyAskHtml(action: NumKeyAction, map: NumKeyMap, name: string): string {
  const current = keyOf(map, action);
  const cells = Array.from({ length: SLOTS }, (_, i) =>
    `<button type="button" data-action="keyAskPick" data-arg="${i + 1}" aria-pressed="${current === i + 1}">${i + 1}</button>`).join('');
  return `<div class="key-ask" role="dialog" aria-label="숫자키 걸기">`
    + `<p class="key-ask-q"><b>${esc(name)}</b>${esc(withJosa(name, '을/를').slice(name.length))} 몇 번 키에 걸까요?</p>`
    + `<div class="key-ask-nums">${cells}</div>`
    + '<div class="key-ask-foot"><span>Esc 취소</span><button type="button" data-action="keyAskClear" data-arg="">키 빼기</button></div></div>';
}
