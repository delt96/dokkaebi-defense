export const NICKNAME_MAX = 8;
const NICKNAME = new RegExp(`^[가-힣A-Za-z0-9]{1,${NICKNAME_MAX}}$`);

/** Trims, NFC-normalizes and validates a nickname; null when it is not a valid name. */
export function normalizeNickname(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.trim().normalize('NFC');
  return NICKNAME.test(name) ? name : null;
}

/** Decision 10: names compare ignoring ASCII case; display keeps the input as typed. */
export function sameNickname(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
