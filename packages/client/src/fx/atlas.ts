import { CELL } from '../layout';
import { FX_SHEETS, type FxKey } from './manifest';
import { BIG_GRADE, type ShotStyle } from './plan';

/**
 * Which baked pixelfx sheet (public/fx, made by scripts/bake-fx.mjs) plays for an effect. No Phaser in here,
 * so the mapping is tested on its own; the effect layer only positions and plays what this picks.
 */

export const FX_KEYS = Object.keys(FX_SHEETS) as FxKey[];
/** Phaser texture and animation key of a sheet (prefixed so it never clashes with a unit sprite id). */
export const textureKey = (key: FxKey): string => `fx:${key}`;

const isKey = (k: string): k is FxKey => k in FX_SHEETS;

/** The impact on the target: a spark for grades 1 to 3, a heavier hit from grade 4; blue for magical damage. */
export function hitKey(style: Pick<ShotStyle, 'magical' | 'grade'>): FxKey {
  if (style.grade >= BIG_GRADE) return style.magical ? 'hit-heavy-mag' : 'hit-heavy';
  return style.magical ? 'hit-mag' : 'hit';
}

export type AreaKind = 'ring' | 'frost' | 'blast' | 'pierce';

/**
 * The sheet for an area of `radius` cells, and how much to scale it: each radius the data uses has its own
 * sheet drawn at its real size (scale 1); any other radius takes the nearest sheet scaled to fit.
 */
export function areaSheet(kind: AreaKind, radius: number): { key: FxKey; scale: number } | null {
  const px = Math.round(radius * CELL);
  const exact = `${kind}-${px}`;
  if (isKey(exact)) return { key: exact, scale: 1 };
  let best: { key: FxKey; px: number } | null = null;
  for (const k of FX_KEYS) {
    if (!k.startsWith(`${kind}-`)) continue;
    const kp = Number(k.slice(kind.length + 1));
    if (!best || Math.abs(kp - px) < Math.abs(best.px - px)) best = { key: k, px: kp };
  }
  return best ? { key: best.key, scale: px / best.px } : null;
}

/** The thrust that runs through pierced enemies; its reach is the skill's length. */
export const pierceSheet = (length: number) => areaSheet('pierce', length);

/**
 * A status drawn around an enemy. The sheets are regenerated against each enemy sprite, so the stars ring
 * its own head and the frost covers its own body; an enemy without a sheet gets a stand-in stun (or none
 * for frost, which the scene shows as a blue tint instead).
 */
export function statusKey(status: 'stun' | 'frozen', defId: string): FxKey | null {
  const k = `${status}-${defId}`;
  if (isKey(k)) return k;
  return status === 'stun' && isKey('stun-japgwi') ? 'stun-japgwi' : null;
}

/** Turn a direction into a quarter turn: the lane runs along the grid, and pixel art stays crisp at 90 degrees. */
export function quarterTurn(dx: number, dy: number): number {
  const a = Math.atan2(dy, dx);
  return Math.round(a / (Math.PI / 2)) * (Math.PI / 2);
}
