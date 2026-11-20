import {
  availableRecipes, countNormalEnemies, unitDefFast, upgradeCost,
  type Effect, type GameData, type GameState, type SkillDef, type Trigger, type UpgradeId,
} from '@dorandi/logic';

const pct = (x: number) => `${Math.round(x * 100)}%`;
const typeName = (t: string) => (t === 'physical' ? '물딜' : t === 'magical' ? '마딜' : '피해');

function triggerText(t: Trigger): string {
  switch (t.kind) {
    case 'chance': return `${pct(t.p)} `;
    case 'nth': return `${t.n}번째 공격마다 `;
    case 'periodic': return `${t.seconds}초마다 `;
    case 'aura': return '오라: ';
    default: return '';
  }
}

function effectText(e: Effect): string {
  switch (e.kind) {
    case 'extraAttack': return '한 번 더 공격';
    case 'crit': return `피해 ${e.mult}배`;
    case 'execute': return `체력 ${pct(e.hpBelow)} 이하에 피해 ${e.mult}배`;
    case 'splash': return `주변 ${e.radius}칸에 공격력 ${pct(e.mult)}`;
    case 'pierce': return `뒤따르는 ${e.length}칸 관통 ${pct(e.mult)}`;
    case 'allInRange': return `사거리 안 모두에게 공격력 ${pct(e.mult)}`;
    case 'stun': return `스턴 ${e.seconds}초`;
    case 'slow': return `${e.radius ? '주변 ' : ''}둔화 ${pct(e.pct)} ${e.seconds}초`;
    case 'knockback': return `${e.distance}칸 밀어냄`;
    case 'vuln': return `받는 ${typeName(e.damageType)} +${pct(e.pct)} ${e.seconds}초${e.maxStacks ? ` (최대 ${e.maxStacks}중첩)` : ''}`;
    case 'dot': return `${e.seconds}초 동안 공격력 ${pct(e.mult)} 지속 피해`;
    case 'groundFire': return `경로 ${e.length}칸에 ${e.seconds}초 불길`;
    case 'onKillExplode': return `처치하면 주변 폭발 ${pct(e.mult)}`;
    case 'auraAttackSpeed': return `주변 아군 공격 속도 +${pct(e.pct)}`;
    case 'auraAttackPower': return `주변 ${typeName(e.damageType)} 아군 공격력 +${pct(e.pct)}`;
    case 'auraEnemyVuln': return `사거리 안 적이 받는 피해 +${pct(e.pct)}`;
  }
}

export function skillText(skills: SkillDef[]): string {
  return skills.map(s => triggerText(s.trigger) + s.effects.map(effectText).join(', ')).join(' / ');
}

export function hudModel(state: GameState): { roundText: string; secondsLeft: number; enemyText: string; danger: number } {
  const b = state.data.balance;
  const n = countNormalEnemies(state);
  const ticksPerSecond = 1000 / b.tickMs;
  const prepTicks = b.prepSeconds * ticksPerSecond;
  const left = state.phase === 'prep' ? prepTicks - state.tick : state.roundEndTick - state.tick;
  return {
    roundText: state.phase === 'prep' ? '준비' : `${state.round} / ${b.rounds} 라운드`,
    secondsLeft: Math.max(0, Math.ceil(left / ticksPerSecond)),
    enemyText: `우리 고개 잡귀 ${n} / ${b.limit}`,
    danger: Math.min(1, n / b.limit),
  };
}

export function helperModel(state: GameState): { recipe: string; name: string; grade: number }[] {
  return availableRecipes(state).map(id => {
    const def = unitDefFast(state.data, id);
    return { recipe: id, name: def.name, grade: def.grade };
  });
}

const UPGRADE_TEXT: Record<UpgradeId, (p: number, n: number) => string> = {
  physical: p => `물딜 공격력 +${pct(p)}`,
  magical: p => `마딜 공격력 +${pct(p)}`,
  polish: p => `1~4등급 공격력 +${pct(p)}`,
  slots: (_p, n) => `칸 ${n}개 열기`,
};

export function upgradeRows(state: GameState): { id: UpgradeId; label: string; level: number; max: number; cost: number | null; effectText: string; affordable: boolean }[] {
  return state.data.upgrades.map(def => {
    const level = state.upgrades[def.id];
    const cost = level >= def.max ? null : upgradeCost(def, level + 1);
    return {
      id: def.id, label: def.label, level, max: def.max, cost,
      effectText: UPGRADE_TEXT[def.id](def.pct ?? 0, def.openCount ?? 0),
      affordable: cost !== null && state.coins >= cost,
    };
  });
}

export function unitCard(state: GameState, slot: number): { name: string; grade: number; typeText: '물딜' | '마딜'; skillText: string; usedIn: string[]; sellPrice: number } | null {
  const unit = state.slots[slot];
  if (!unit) return null;
  const def = unitDefFast(state.data, unit.defId);
  const usedIn: string[] = [];
  for (const r of state.data.recipes) {
    if (!r.materials.includes(def.id)) continue;
    const name = unitDefFast(state.data, r.result).name;
    if (!usedIn.includes(name)) usedIn.push(name);
  }
  return {
    name: def.name, grade: def.grade, typeText: def.damageType === 'physical' ? '물딜' : '마딜',
    skillText: skillText(def.skills), usedIn, sellPrice: state.data.balance.sellPrice[def.grade - 1] ?? 0,
  };
}

export function dexEntries(data: GameData): { id: string; name: string; grade: number; recipe: string[] }[] {
  const name = (id: string) => data.units.find(u => u.id === id)?.name ?? id;
  return data.units.map(u => ({
    id: u.id, name: u.name, grade: u.grade,
    recipe: (data.recipes.find(r => r.result === u.id)?.materials ?? []).map(name),
  }));
}
