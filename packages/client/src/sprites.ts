/**
 * Texture key for a unit or enemy id. Stage 3 pass bosses reuse the art of the boss they repeat
 * (`jinegaksi3` draws `jinegaksi`); an id with neither its own file nor a base gets null, and the
 * scene draws its fallback (a grade-coloured disc with the name's first letter). `alias` names art to borrow for an id
 * without its own (stage 3 event enemies wear the hidden unit they can be tamed into).
 */
export function spriteKey(id: string, have: ReadonlySet<string>, alias?: ReadonlyMap<string, string>): string | null {
  if (have.has(id)) return id;
  const base = id.replace(/\d+$/, '');
  if (base !== id && have.has(base)) return base;
  const borrowed = alias?.get(id);
  return borrowed !== undefined && have.has(borrowed) ? borrowed : null;
}

/** Enemy id -> the unit its taming gives, from the rule data (empty without an economy). */
export function tameArt(data: { economy?: { tame?: { targets: { enemy: string; unit: string }[] } } }): ReadonlyMap<string, string> {
  return new Map((data.economy?.tame?.targets ?? []).map(t => [t.enemy, t.unit]));
}
