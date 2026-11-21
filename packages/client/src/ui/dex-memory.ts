/** What the dex remembers between openings: the recent searches and the last filters and search text. */
export const RECENT_KEY = 'dorandi.dexRecent';
export const VIEW_KEY = 'dorandi.dexView';
export const RECENT_MAX = 5;

export interface DexView { filter: string; kind: string; role: string; query: string; adv: boolean; skill: string; mine: string[] }
type Store = Pick<Storage, 'getItem' | 'setItem'>;

/** localStorage, or null when the browser denies it (private mode, blocked site data). */
function defaultStore(): Store | null {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

export const cleanTerm = (term: string): string => term.replace(/\s+/g, ' ').trim();

/** Puts a term first, drops its duplicate, keeps the newest RECENT_MAX; empty terms change nothing. */
export function addRecent(list: readonly string[], term: string): string[] {
  const t = cleanTerm(term);
  if (!t) return [...list];
  return [t, ...list.filter(x => x !== t)].slice(0, RECENT_MAX);
}

export const removeRecent = (list: readonly string[], term: string): string[] => list.filter(x => x !== term);

function read(key: string, store: Store | null): unknown {
  try { const raw = store?.getItem(key); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

function write(key: string, value: unknown, store: Store | null): void {
  try { store?.setItem(key, JSON.stringify(value)); } catch { /* no storage: the memory lasts for this page only */ }
}

export function loadRecent(store: Store | null = defaultStore()): string[] {
  const v = read(RECENT_KEY, store);
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string').reduce<string[]>((acc, x) => (acc.length < RECENT_MAX && cleanTerm(x) && !acc.includes(cleanTerm(x)) ? [...acc, cleanTerm(x)] : acc), []);
}

export const saveRecent = (list: readonly string[], store: Store | null = defaultStore()): void => write(RECENT_KEY, list, store);

export function loadView(store: Store | null = defaultStore()): DexView {
  const v = read(VIEW_KEY, store);
  const o = v && typeof v === 'object' ? v as Record<string, unknown> : {};
  const str = (x: unknown, d: string) => (typeof x === 'string' ? x : d);
  const mine = Array.isArray(o.mine) ? o.mine.filter((x): x is string => typeof x === 'string') : [];
  return { filter: str(o.filter, 'all'), kind: str(o.kind, 'all'), role: str(o.role, 'all'), query: str(o.query, ''), adv: o.adv === true, skill: str(o.skill, ''), mine };
}

export const saveView = (view: DexView, store: Store | null = defaultStore()): void => write(VIEW_KEY, view, store);
