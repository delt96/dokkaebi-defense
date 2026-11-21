import type { UnitDef } from '@dorandi/logic';

/** The dex's 역할 filter: what a unit does for the team, read from its skill effects. */
export type Role = 'physVuln' | 'magVuln' | 'slow' | 'stun' | 'area' | 'aura';
export interface RoleTag { role: Role; /** the 깎 amount in percent (the strongest one the unit has) */ pct?: number }

export const ROLE_ORDER: readonly Role[] = ['physVuln', 'magVuln', 'slow', 'stun', 'area', 'aura'];
export const ROLE_LABEL: Record<Role, string> = { physVuln: '물깎', magVuln: '마깎', slow: '둔화', stun: '기절', area: '광역', aura: '오라' };

const AREA_KINDS: ReadonlySet<string> = new Set(['splash', 'allInRange', 'chain', 'pierce', 'groundFire', 'onKillExplode', 'onVulnKillExplode']);
const AURA_KINDS: ReadonlySet<string> = new Set(['auraAttackPower', 'auraAttackSpeed', 'auraEnemyVuln']);

const percent = (ratio: number): number => Number((ratio * 100).toFixed(1));

/**
 * The roles of a unit, always in ROLE_ORDER. 물깎/마깎 come from `vuln` and `auraEnemyVuln` (damageType 'all' or an aura
 * without a type counts for both) with the largest amount; 둔화 from `slow`, 기절 from `stun`, 광역 from the area
 * effects, 오라 from the aura effects.
 */
export function unitRoles(def: Pick<UnitDef, 'skills'>): RoleTag[] {
  const vuln: Partial<Record<'physical' | 'magical', number>> = {};
  const has = new Set<Role>();
  for (const skill of def.skills) {
    for (const e of skill.effects) {
      if (e.kind === 'vuln' || e.kind === 'auraEnemyVuln') {
        const type = e.damageType;
        for (const t of ['physical', 'magical'] as const) {
          if (type === undefined || type === 'all' || type === t) vuln[t] = Math.max(vuln[t] ?? 0, e.pct);
        }
      }
      if (e.kind === 'slow') has.add('slow');
      if (e.kind === 'stun') has.add('stun');
      if (AREA_KINDS.has(e.kind)) has.add('area');
      if (AURA_KINDS.has(e.kind)) has.add('aura');
    }
  }
  const tags: RoleTag[] = [];
  for (const role of ROLE_ORDER) {
    if (role === 'physVuln' && vuln.physical !== undefined) tags.push({ role, pct: percent(vuln.physical) });
    else if (role === 'magVuln' && vuln.magical !== undefined) tags.push({ role, pct: percent(vuln.magical) });
    else if (has.has(role)) tags.push({ role });
  }
  return tags;
}

export const roleText = (tag: RoleTag): string => `${ROLE_LABEL[tag.role]}${tag.pct !== undefined ? ` ${tag.pct}%` : ''}`;
