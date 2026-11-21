// Per-tab storage of rejoin keys (spec 6): sessionStorage, so a duplicated tab carries the key along.

export interface StoredSession { key?: string; name: string }

const roomKey = (roomId: string) => `dorandi:room:${roomId}`;
const NAME_KEY = 'dorandi:name';

function storage(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

export function saveSession(roomId: string, s: StoredSession): void {
  const st = storage();
  if (!st) return;
  try {
    st.setItem(roomKey(roomId), JSON.stringify(s.key === undefined ? { name: s.name } : { key: s.key, name: s.name }));
    st.setItem(NAME_KEY, s.name);
  } catch {
    // storage full or blocked: rejoin falls back to a fresh join
  }
}

export function loadSession(roomId: string): StoredSession | null {
  const st = storage();
  if (!st) return null;
  try {
    const raw = st.getItem(roomKey(roomId));
    if (raw === null) return null;
    const v: unknown = JSON.parse(raw);
    if (typeof v !== 'object' || v === null) return null;
    const o = v as Record<string, unknown>;
    if (typeof o.name !== 'string') return null;
    return typeof o.key === 'string' ? { key: o.key, name: o.name } : { name: o.name };
  } catch {
    return null;
  }
}

export function clearSession(roomId: string): void {
  try {
    storage()?.removeItem(roomKey(roomId));
  } catch {
    // ignore
  }
}

export function lastName(): string | null {
  try {
    return storage()?.getItem(NAME_KEY) ?? null;
  } catch {
    return null;
  }
}
