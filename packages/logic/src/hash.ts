const DEFAULT_SKIP: ReadonlySet<string> = new Set(['data']);

function canon(value: unknown, skip: ReadonlySet<string>): string | undefined {
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') return undefined;
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(v => canon(v, skip) ?? 'null').join(',') + ']';
  const parts: string[] = [];
  for (const key of Object.keys(value).sort()) {
    if (skip.has(key)) continue;
    const s = canon((value as Record<string, unknown>)[key], skip);
    if (s !== undefined) parts.push(JSON.stringify(key) + ':' + s);
  }
  return '{' + parts.join(',') + '}';
}

export function canonicalJson(value: unknown, skip: ReadonlySet<string> = DEFAULT_SKIP): string {
  return canon(value, skip) ?? 'null';
}

export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function stateHash(state: unknown): string {
  return fnv1a(canonicalJson(state));
}

export function chainHash(prev: string, value: unknown): string {
  return fnv1a(prev + canonicalJson(value));
}
