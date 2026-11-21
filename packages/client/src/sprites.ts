/**
 * Texture key for a unit or enemy id. Stage 3 pass bosses reuse the art of the boss they repeat
 * (`jinegaksi3` draws `jinegaksi`); an id with neither its own file nor a base gets null, and the
 * scene draws its fallback (a grade-coloured disc with the name's first letter).
 */
export function spriteKey(id: string, have: ReadonlySet<string>): string | null {
  if (have.has(id)) return id;
  const base = id.replace(/\d+$/, '');
  return base !== id && have.has(base) ? base : null;
}
