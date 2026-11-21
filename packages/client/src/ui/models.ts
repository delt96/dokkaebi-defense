import {
  attackIntervalTicks, damageBonus, speedBonus, unitAttack, countNormalEnemies, missingMaterials, recipesUsing, storedMaterials, unitDefFast,
  upgradeCost, summonOddsForRound,
  type DamageType, type Effect, type GameData, type GameState, type RecipeDef, type SkillDef, type StatusArea, type Trigger, type UnitDef, type UpgradeId,
} from '@dorandi/logic';
import { ROLE_LABEL, unitRoles, type RoleTag } from './dex-roles';

const pct = (x: number) => `${Math.round(x * 100)}%`;
const typeName = (t: string) => (t === 'physical' ? '물딜' : t === 'magical' ? '마딜' : '피해');

function triggerText(t: Trigger): string {
  switch (t.kind) {
    case 'chance': return `${pct(t.p)} `;
    case 'nth':
      if (!t.phase) return `${t.n}번째 공격마다 `;
      return t.n === 2 && t.phase === 1 ? '홀수 번째 공격마다 ' : `${t.n}번 중 ${t.phase}번째 공격마다 `;
    case 'periodic': return `${t.seconds}초마다 `;
    case 'aura': return '오라: ';
    case 'charge': return `${t.seconds}초마다 충전한 다음 공격에 `;
    case 'streak': return `같은 적을 ${t.n}번 연달아 치면 `;
    case 'targetHpBelow': return `체력 ${pct(t.pct)} 이하 대상에게 `;
    case 'targetSlowed': return '둔화된 대상에게 ';
    case 'neighborHits': return `이웃의 기본 공격 ${t.count}번마다${t.lockoutSeconds ? ` (발동 뒤 ${t.lockoutSeconds}초 쉼)` : ''} `;
    default: return '';
  }
}

/**
 * `nameOf` turns a source id into a unit name for the "does not stack with" notes; `extended` is the stage 3 data's
 * extendedCombat, which spells out the radius of area slows (stage 1-2 text stays as it was).
 */
export interface SkillCtx { interval: number; pulseSeconds: number; nameOf?: (id: string) => string; extended?: boolean }

/** Who a status lands on (stage 3 `radius` / `area`); empty for the plain target. */
function areaText(a: StatusArea): string {
  if (a.radius) return `주변 ${a.radius}칸 `;
  if (a.area === 'hit') return '맞은 적 모두 ';
  if (a.area === 'others') return '대상 말고 맞은 적에게 ';
  return '';
}

/** Stage 3 support effects keyed by a material's id do not stack with that material's own effect. */
function sourceNote(source: string | undefined, ctx?: SkillCtx): string | null {
  return source ? `${ctx?.nameOf?.(source) ?? source}의 효과와 겹치지 않음` : null;
}

/** " (a, b)" from the notes that apply, or nothing. */
function paren(...notes: (string | number | null | undefined | false)[]): string {
  const list = notes.filter((n): n is string => typeof n === 'string' && n !== '');
  return list.length ? ` (${list.join(', ')})` : '';
}

function fireText(e: Extract<Effect, { kind: 'groundFire' }>): string {
  const where = e.align === 'ahead' ? `대상이 갈 쪽 ${e.length}칸` : e.align === 'behind' ? `대상이 지나온 ${e.length}칸` : `경로 ${e.length}칸`;
  return `${where}에 ${e.seconds}초 불길`;
}

function dotText(e: Extract<Effect, { kind: 'dot' }>, trigger: Trigger, ctx?: SkillCtx): string {
  const base = `${e.seconds}초 동안 공격력 ${pct(e.mult)} 지속 피해`;
  if (!ctx || trigger.kind !== 'always' || ctx.interval >= e.seconds) return base;
  // a dot re-applied before it ends only lands the pulses that fit between two attacks
  const pulses = Math.max(1, Math.round(e.seconds / ctx.pulseSeconds));
  const landed = Math.min(pulses, Math.floor(ctx.interval / ctx.pulseSeconds));
  return `${base} (다시 걸려 실제 ${pct((e.mult * landed) / pulses)})`;
}

function effectText(e: Effect, trigger: Trigger, ctx?: SkillCtx): string {
  switch (e.kind) {
    case 'extraAttack': return '한 번 더 공격';
    case 'crit': return `피해 ${e.mult}배`;
    case 'execute': return `체력 ${pct(e.hpBelow)} 이하에 피해 ${e.mult}배`;
    case 'splash': {
      const area = e.radiusCycle?.length ? `주변 ${e.radiusCycle.join('→')}칸을 번갈아` : `주변 ${e.radius}칸에`;
      const bonus = e.stunnedBonus ? ` (스턴 중이거나 풀린 지 ${e.stunnedBonus.graceSeconds}초 안이면 ${e.stunnedBonus.mult}배)` : '';
      return `${area} 공격력 ${pct(e.mult)}${bonus}`;
    }
    case 'pierce': {
      const bonus = e.knockedBonus ? ` (이번 라운드에 밀려난 적에게 ${e.knockedBonus}배)` : '';
      return `${e.both ? '앞뒤' : '뒤따르는'} ${e.length}칸 관통 ${pct(e.mult)}${bonus}`;
    }
    case 'allInRange': return `사거리 안 모두에게 공격력 ${pct(e.mult)}`;
    case 'stun': return `${areaText(e)}스턴 ${e.seconds}초`;
    // stage 1-2 slows with a radius keep their old wording
    case 'slow': return `${e.radius ? (ctx?.extended ? areaText(e) : '주변 ') : areaText(e)}둔화 ${pct(e.pct)} ${e.seconds}초`;
    case 'knockback': return `${areaText(e)}${e.distance}칸 밀어냄`;
    case 'vuln': return `${areaText(e)}받는 ${typeName(e.damageType)} +${pct(e.pct)} ${e.seconds}초${paren(e.maxStacks && `최대 ${e.maxStacks}중첩`, sourceNote(e.source, ctx))}`;
    case 'dot': return areaText(e) + dotText(e, trigger, ctx);
    case 'groundFire': return fireText(e);
    case 'onKillExplode': return `${e.requireExecute ? '처형으로 ' : ''}처치하면 주변 폭발 ${pct(e.mult)}`;
    case 'auraAttackSpeed': return `주변 ${e.damageType ? `${typeName(e.damageType)} ` : ''}아군 공격 속도 +${pct(e.pct)}`;
    case 'auraAttackPower': return `주변 ${e.damageType === 'all' ? '' : `${typeName(e.damageType)} `}아군 공격력 +${pct(e.pct)}${paren(sourceNote(e.source, ctx))}`;
    case 'auraEnemyVuln': return `사거리 안 적이 받는 ${e.damageType ? typeName(e.damageType) : '피해'} +${pct(e.pct)}${paren(sourceNote(e.source, ctx))}`;
    case 'strike': return `대상에게 공격력 ${pct(e.mult)} 추가 피해`;
    case 'chain': return `${e.range}칸 안의 다음 적에게 차례로 ${pct(e.mult)} (최대 ${e.maxBounces}번)`;
    case 'rampCrit': return `같은 적을 연달아 치면 피해가 ${e.step}배씩 올라 최대 ${e.max}배`;
    case 'onVulnKillExplode': return `약화된 적이 쓰러지면 주변 ${e.radius}칸 폭발 ${pct(e.mult)}${e.cooldownSeconds ? ` (${e.cooldownSeconds}초에 한 번)` : ''}`;
    case 'coinOnFirstHit': return `라운드 첫 명중에 엽전 ${e.coins}냥`;
    case 'coinTimer': return `전투 ${e.everySeconds}초마다 엽전 ${e.coins}냥 (라운드당 최대 ${e.maxPerRound}냥)`;
  }
}

export function skillText(skills: SkillDef[], ctx?: SkillCtx): string {
  return skills.map(s => triggerText(s.trigger) + s.effects.map(e => effectText(e, s.trigger, ctx)).join(', ')).join(' / ');
}

const nameIn = (data: GameData) => (id: string): string => data.units.find(u => u.id === id)?.name ?? id;

function ctxOf(data: GameData, def: UnitDef): SkillCtx {
  return { interval: def.interval, pulseSeconds: data.balance.pulseSeconds, nameOf: nameIn(data), extended: data.balance.extendedCombat === true };
}

/** Stage 3 extra damage on every basic attack, shown as its own line (v5 6장 "도감 도움말"). */
export function basicHitText(data: GameData, def: UnitDef): string | null {
  const h = def.onBasicHit;
  if (!h || (!h.targetPct && !h.splashPct)) return null;
  const parts: string[] = [];
  if (h.targetPct) parts.push(`대상에게 공격력 ${pct(h.targetPct)}`);
  if (h.splashPct) parts.push(`주변 ${data.balance.onBasicHitRadius ?? 0}칸에 공격력 ${pct(h.splashPct)}`);
  return `기본 공격마다 추가 피해: ${parts.join(', ')}`;
}

/** The whole skill text of a unit: its skills, then the stage 3 basic-hit line. */
export function unitSkillText(data: GameData, def: UnitDef): string {
  const skills = skillText(def.skills, ctxOf(data, def));
  const extra = basicHitText(data, def);
  return [skills, extra].filter(Boolean).join(' / ');
}

const AURA_KINDS = new Set<Effect['kind']>(['auraAttackSpeed', 'auraAttackPower', 'auraEnemyVuln']);
const CONTROL_TEXT: Partial<Record<Effect['kind'], string>> = { stun: '스턴', slow: '둔화', knockback: '밀어내기' };
/** The stacking key the rules use for supports (effects.ts auraKey): a material's id when `source` names it. */
const supportKey = (owner: string, e: Effect): string => `${('source' in e && e.source) || owner}:${e.kind}`;

function supports(def: UnitDef): Effect[] {
  return def.skills.flatMap(s => s.effects.filter(e => (s.trigger.kind === 'aura' && AURA_KINDS.has(e.kind)) || ('source' in e && e.source)));
}

/** Stage 3 notes under a unit: which upgrade line it reads, and the aura caps. Empty for stage 1-2 data. */
export function unitNotes(data: GameData, def: UnitDef): string[] {
  const out: string[] = [];
  if (data.balance.inheritUpgrades && def.lineage && def.lineage.length > 1) out.push('강화: 물딜·마딜 강화 중 높은 쪽을 받음');
  const caps = data.balance.auraCaps;
  if (caps && def.skills.some(s => s.effects.some(e => e.kind === 'auraAttackSpeed' || e.kind === 'auraAttackPower'))) {
    out.push(`오라는 종류마다 한 번만, 합쳐서 공격 속도 +${pct(caps.attackSpeed)}·공격력 +${pct(caps.attackPower)}까지`);
  }
  return out;
}

export interface CombineNotes { lineage: string | null; range: number; lostAuras: string[]; lostControls: string[]; inherited: string[] }

/**
 * Stage 3 combine card (v5 6장 "도감 도움말"): the result's damage lines and range, the materials' auras and
 * controls the result does not keep, and the support effects it carries on from a material. Null for stage 1-2.
 */
export function combineNotes(data: GameData, result: string): CombineNotes | null {
  if (!data.balance.extendedCombat) return null;
  const recipe = data.recipes.find(r => r.result === result);
  if (!recipe) return null;
  const def = unitDefFast(data, result);
  const name = nameIn(data);
  const kept = new Set(supports(def).map(e => supportKey(def.id, e)));
  const resultKinds = new Set(def.skills.flatMap(s => s.effects.map(e => e.kind)));
  const lostAuras: string[] = [];
  const controls = new Map<string, string[]>();
  for (const id of new Set(recipe.materials)) {
    const m = unitDefFast(data, id);
    for (const s of m.skills) {
      for (const e of s.effects) {
        if (s.trigger.kind === 'aura' && AURA_KINDS.has(e.kind) && !kept.has(supportKey(m.id, e))) {
          lostAuras.push(`${m.name}의 ${effectText(e, s.trigger, ctxOf(data, m))}`);
        }
        const c = CONTROL_TEXT[e.kind];
        if (c && !resultKinds.has(e.kind)) {
          const who = controls.get(c) ?? [];
          if (!who.includes(m.name)) who.push(m.name);
          controls.set(c, who);
        }
      }
    }
  }
  const inherited: string[] = [];
  for (const s of def.skills) {
    for (const e of s.effects) {
      const source = 'source' in e ? e.source : undefined;
      if (source && source !== def.id) inherited.push(`${name(source)}의 ${effectText({ ...e, source: undefined } as Effect, s.trigger, INHERIT_CTX(data))}`);
    }
  }
  const lineage = def.lineage && def.lineage.length > 1 ? '물딜·마딜 (강화는 높은 쪽)' : def.lineage?.[0] ? typeName(def.lineage[0]) : null;
  return {
    lineage, range: def.range, lostAuras, inherited,
    lostControls: [...controls].map(([c, who]) => `${c} (${who.join(', ')})`),
  };
}

/** Inherited lines read like the material's own effect: no source note, no re-applied dot note, stage 3 radii. */
const INHERIT_CTX = (data: GameData): SkillCtx => ({ interval: Number.POSITIVE_INFINITY, pulseSeconds: data.balance.pulseSeconds, extended: true });

/** The combine notes as card lines; empty for stage 1-2. */
export function combineNoteLines(data: GameData, result: string): string[] {
  const n = combineNotes(data, result);
  if (!n) return [];
  const lines = [`${n.lineage ? `계열 ${n.lineage} · ` : ''}사거리 ${n.range}칸`];
  if (n.inherited.length) lines.push(`이어받는 지원 효과: ${n.inherited.join(' / ')}`);
  if (n.lostAuras.length) lines.push(`조합하면 사라지는 오라: ${n.lostAuras.join(' / ')}`);
  if (n.lostControls.length) lines.push(`조합하면 사라지는 제어: ${n.lostControls.join(', ')}`);
  return lines;
}

/** "메밀묵 1개 · 엽전 60냥", or null for a recipe without a cost. */
export function costText(recipe: RecipeDef | undefined): string | null {
  const parts: string[] = [];
  if (recipe?.cost?.buckwheat) parts.push(`메밀묵 ${recipe.cost.buckwheat}개`);
  if (recipe?.cost?.coins) parts.push(`엽전 ${recipe.cost.coins}냥`);
  return parts.length ? parts.join(' · ') : null;
}

/** What the player is short of to pay for a recipe ("메밀묵 1개 모자람"), or null when it can be paid. */
export function costShortText(state: GameState, recipe: RecipeDef | undefined): string | null {
  const parts: string[] = [];
  const buckwheat = (recipe?.cost?.buckwheat ?? 0) - state.buckwheat;
  const coins = (recipe?.cost?.coins ?? 0) - state.coins;
  if (buckwheat > 0) parts.push(`메밀묵 ${buckwheat}개`);
  if (coins > 0) parts.push(`엽전 ${coins}냥`);
  return parts.length ? `${parts.join(', ')} 모자람` : null;
}

export function selectedSlot(state: GameState, id: number | null): number | null {
  const slot = state.slots.findIndex(unit => unit?.id === id);
  return slot < 0 ? null : slot;
}

export function nextUnitId(state: GameState, selected: number | null): number | null {
  const units = state.slots.filter(unit => unit !== null);
  const next = units.findIndex(unit => unit.id === selected) + 1;
  return (units[next] ?? units[0])?.id ?? null;
}

export interface Notice { text: string; until: number }

export function activeNotice(notice: Notice | null, now: number): string | null {
  return notice && now < notice.until ? notice.text : null;
}

export function summonOddsText(data: GameData, round: number): string {
  const odds = summonOddsForRound(data.balance, round);
  const rates = odds.map((p, i) => `${i + 1}등급 ${pct(p)}`).join(' · ');
  const opens = data.balance.summonOddsByRound?.find(b => (b.odds[2] ?? 0) > 0)?.fromRound;
  return `소환 확률 · ${rates}${opens && opens > 1 ? ` (3등급은 ${opens}라운드부터)` : ''}`;
}

export function rightModel(state: GameState): { canSummon: boolean; canConvert: boolean; pending: number } {
  const live = state.phase !== 'ended' && state.tokens > 0;
  const freeCell = state.slots.some((u, i) => !u && state.open[i]);
  return {
    canSummon: live && freeCell, canConvert: live, pending: state.pendingPity.length,
  };
}

const REJECT_TEXT: Record<string, string> = {
  noSlot: '빈 칸이 없습니다',
  noToken: '도깨비불이 없습니다',
  noCoins: '엽전이 모자랍니다',
  noBuckwheat: '메밀묵이 모자랍니다',
  maxed: '이미 최대 단계입니다',
  missingMaterials: '재료가 모자랍니다',
  notAlive: '넋은 할 수 없습니다',
  staleUnit: '배치가 바뀌었습니다. 다시 시도해 주세요',
  noSupportToken: '지원 토큰이 없습니다',
  targetNotAlive: '그 고개는 이미 뚫렸습니다',
  targetAlreadyReceived: '이번 라운드에 이미 지원을 받았습니다',
  badArgs: '잘못된 입력입니다',
  // stage 3 economy
  marketClosed: '장터는 1라운드부터 엽니다',
  soldOut: '이번 장날 몫을 다 샀습니다',
  badTarget: '목표로 고를 수 없는 유닛입니다',
  notOffered: '받은 설화 의뢰가 없습니다',
  missionClosed: '입장 시간이 지났습니다',
  noTarget: '길들일 대상이 사라졌습니다',
  tameHp: '아직 체력이 높습니다',
  tameCondition: '길들이기 조건이 풀렸습니다',
  locked: '배달 중인 유닛은 쓸 수 없습니다',
  busy: '이미 배달을 주고받는 중입니다',
  targetBusy: '상대가 다른 배달을 주고받는 중입니다',
  targetAway: '그 고개는 연결이 끊겼습니다',
  cooldown: '아직 다음 배달을 할 수 없습니다',
  noJige: '지게 도깨비가 없습니다',
  noOffer: '받을 배달이 없습니다',
  // storage
  notStorable: '1·2등급만 보관할 수 있습니다',
  nothingToStore: '보관할 1·2등급 유닛이 없습니다',
  notStored: '보관함에 없는 유닛입니다',
  slotTaken: '그 칸에는 이미 유닛이 있습니다',
};

export function rejectText(reason: string): string | null {
  return REJECT_TEXT[reason] ?? null;
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

/**
 * `cost` is set on recipes with a cost (stage 3 grades 5 and 6), `short` when every material is there but the cost is not,
 * `stored` when some materials would come out of storage (how many).
 */
export interface HelperItem { recipe: string; name: string; grade: number; cost?: string; short?: string; stored?: number }

/** Recipes that can be made now (in table order); stage 3 also lists those that only lack the cost, marked `short`. */
export function helperModel(state: GameState): HelperItem[] {
  const out: HelperItem[] = [];
  for (const recipe of state.data.recipes) {
    if (missingMaterials(state, recipe.result).length) continue;
    const cost = costText(recipe);
    const short = cost ? costShortText(state, recipe) : null;
    const def = unitDefFast(state.data, recipe.result);
    const stored = storedMaterials(state, recipe.result);
    out.push({
      recipe: recipe.result, name: def.name, grade: def.grade, ...(cost ? { cost } : {}), ...(short ? { short } : {}), ...(stored ? { stored } : {}),
    });
  }
  return out;
}

const COMBINE_KEYS = ['Z', 'X', 'C'] as const;

/** `cost` is only set on recipes with a cost (stage 3 grades 5 and 6); `short` when every material is there but not the cost. */
export interface CombineOption { result: string; name: string; grade: number; missing: string[]; key: 'Z' | 'X' | 'C' | null; cost?: string; short?: string }

export function combineOptions(state: GameState, slot: number): CombineOption[] {
  let ready = 0;
  const recipes = recipesUsing(state, slot);
  const readyFirst = [...recipes.filter(r => !r.missing.length), ...recipes.filter(r => r.missing.length)];
  return readyFirst.map(({ result, missing }) => {
    const { name, grade } = unitDefFast(state.data, result);
    const recipe = state.data.recipes.find(r => r.result === result);
    const cost = costText(recipe);
    const short = cost && missing.length === 0 ? costShortText(state, recipe) : null;
    return {
      result, name, grade,
      missing: missing.map(id => unitDefFast(state.data, id).name),
      // a recipe that cannot be paid gets no hotkey, so Z/X/C always mean "combine now"
      key: missing.length === 0 && !short ? COMBINE_KEYS[ready++] ?? null : null,
      ...(cost ? { cost } : {}),
      ...(short ? { short } : {}),
    };
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

export function unitCard(state: GameState, slot: number): { name: string; grade: number; typeText: '물딜' | '마딜'; skillText: string; notes: string[]; usedIn: string[]; attack: number; interval: number; range: number; sellPrice: number } | null {
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
    attack: Math.round(unitAttack(def, state.data.balance) * (1 + damageBonus(state, slot))),
    interval: attackIntervalTicks(def.interval, speedBonus(state, slot)) * state.data.balance.tickMs / 1000,
    range: def.range, skillText: unitSkillText(state.data, def), notes: unitNotes(state.data, def), usedIn, sellPrice: state.data.balance.sellPrice[def.grade - 1] ?? 0,
  };
}

/** `hidden`: a stage 3 hidden unit, which is tamed from a boss instead of summoned. `recipeIds` are the material ids. */
export interface DexEntry {
  id: string; name: string; grade: number; recipe: string[]; recipeIds: string[]; hidden: boolean;
  typeText: string; range: number; skillText: string; cost: string | null; notes: string[];
  /** what 기술로 찾기 reads: the skill text, the role names and a few plain-word aliases (no spaces) */
  search: string;
  /** the unit's own damage type and the roles read from its skills (dex-roles) */
  kind: DamageType; roles: RoleTag[];
}

/** Words people search by that the skill text spells another way. */
const SEARCH_ALIAS: [text: string, alias: string][] = [['스턴', '기절'], ['관통', '꿰뚫']];

/** The string 기술로 찾기 looks in: the skill text a card shows, the role names (물깎 …) and the aliases it needs. */
export function skillSearchText(skillText: string, roles: readonly RoleTag[]): string {
  const aliases = SEARCH_ALIAS.filter(([t]) => skillText.includes(t)).map(([, a]) => a);
  return [skillText, ...roles.map(t => ROLE_LABEL[t.role]), ...aliases].join(' ').replace(/\s+/g, '');
}

export function dexEntries(data: GameData): DexEntry[] {
  const name = nameIn(data);
  return data.units.map(u => {
    const recipe = data.recipes.find(r => r.result === u.id);
    return {
      id: u.id, name: u.name, grade: u.grade, hidden: u.hidden === true,
      recipe: (recipe?.materials ?? []).map(name), recipeIds: [...(recipe?.materials ?? [])],
      kind: u.damageType, roles: unitRoles(u),
      typeText: typeName(u.damageType), range: u.range, skillText: unitSkillText(data, u), cost: costText(recipe),
      search: skillSearchText(unitSkillText(data, u), unitRoles(u)),
      // the combine card's first line (lines and range) is already in the row
      notes: [...combineNoteLines(data, u.id).slice(1), ...unitNotes(data, u)],
    };
  });
}

export function resultModel(state: GameState, bestUnitId: string | null): {
  title: '클리어' | '탈락'; reasonText: string; roundReached: number; series: number[];
  lastEnemies: number; maxEnemies: number; bestUnit: { name: string; grade: number } | null; helperText: string;
} {
  const r = state.result;
  const reasonText = r?.reason === 'limit' ? '고개가 뚫렸습니다' : r?.reason === 'boss' ? '고개 보스를 놓쳤습니다' : '';
  const series = state.stats.map(s => s.endEnemies);
  const best = bestUnitId ? unitDefFast(state.data, bestUnitId) : null;
  return {
    title: r?.outcome === 'clear' ? '클리어' : '탈락',
    reasonText,
    roundReached: r?.round ?? state.round,
    series,
    lastEnemies: series[series.length - 1] ?? 0,
    maxEnemies: Math.max(0, ...state.stats.map(s => s.maxEnemies)),
    bestUnit: best ? { name: best.name, grade: best.grade } : null,
    helperText: `도우미 ${state.helperOpens}회`,
  };
}

/**
 * One material in a dex recipe tree. `mark`: `have` when a board unit is set aside for it, `missing` when not,
 * `covered` when an ancestor is already on the board (so it is not needed). `cost` is this node's own combine cost.
 * `path` is its place in the tree ("1.0" = first material of the second material), stable while the board changes.
 */
export interface RecipeNode {
  id: string; name: string; grade: number; hidden: boolean; cost: string | null; path: string;
  mark: 'have' | 'missing' | 'covered'; children: RecipeNode[];
}

/** How many materials sit under a node, all the way down. */
export function treeSize(node: RecipeNode): number {
  return node.children.reduce((n, c) => n + 1 + treeSize(c), 0);
}

/** Recipe trees stop here even if the data ever loops; the real trees are at most 5 deep. */
const TREE_DEPTH = 8;

/**
 * The full material tree of a combinable unit, down to units without a recipe; null when the unit has none (grade 1,
 * hidden units). `board` lists the def ids on the player's board, one entry per unit: each one is set aside for one node
 * only, the higher nodes first (owning a grade 4 material saves its whole branch), left to right within a level.
 */
export function recipeTree(data: GameData, id: string, board: readonly string[] = []): RecipeNode[] | null {
  const recipeOf = (unit: string) => data.recipes.find(r => r.result === unit);
  const root = recipeOf(id);
  if (!root) return null;
  const pool = new Map<string, number>();
  for (const unit of board) pool.set(unit, (pool.get(unit) ?? 0) + 1);
  const build = (unit: string, depth: number, path: string): RecipeNode => {
    const def = unitDefFast(data, unit);
    const recipe = recipeOf(unit);
    return {
      id: unit, name: def.name, grade: def.grade, hidden: def.hidden === true, cost: costText(recipe), path, mark: 'missing',
      children: recipe && depth < TREE_DEPTH ? recipe.materials.map((m, i) => build(m, depth + 1, `${path}.${i}`)) : [],
    };
  };
  const top = root.materials.map((m, i) => build(m, 1, String(i)));
  const cover = (node: RecipeNode) => { node.mark = 'covered'; node.children.forEach(cover); };
  let level = top;
  while (level.length) {
    const next: RecipeNode[] = [];
    for (const node of level) {
      const left = pool.get(node.id) ?? 0;
      if (left > 0) {
        pool.set(node.id, left - 1);
        node.mark = 'have';
        node.children.forEach(cover);
      } else next.push(...node.children);
    }
    level = next;
  }
  return top;
}

/** Def ids of the units a combine can use: the board's (a unit out on a delivery is locked), then the stored ones. */
export function boardUnits(state: GameState): string[] {
  return [...state.slots.flatMap(u => (u && !u.locked ? [u.defId] : [])), ...(state.storage ?? []).map(u => u.defId)];
}

/** One stack in the storage column: every stored unit of one kind. */
export interface StorageStack { defId: string; name: string; grade: number; count: number; sellPrice: number }

/** The storage as stacks, lower grades first, then in the unit table's order, so a stack keeps its place. */
export function storageStacks(state: GameState): StorageStack[] {
  const counts = new Map<string, number>();
  for (const u of state.storage ?? []) counts.set(u.defId, (counts.get(u.defId) ?? 0) + 1);
  const order = new Map(state.data.units.map((u, i) => [u.id, i]));
  return [...counts].map(([defId, count]) => {
    const def = unitDefFast(state.data, defId);
    return { defId, name: def.name, grade: def.grade, count, sellPrice: state.data.balance.sellPrice[def.grade - 1] ?? 0 };
  }).sort((a, b) => a.grade - b.grade || (order.get(a.defId) ?? 0) - (order.get(b.defId) ?? 0));
}

/** Where a material link came from, to go back to it with the list as it was. */
export interface DexStep { id: string; filter: string; query: string }

/**
 * The dex's browsing state: grade/hidden filter, search, the units followed through material links (newest last),
 * the entry to scroll to and flash after the next draw, the entries whose material tree is open, and the branches
 * under a ✓ material the player unfolded (`entry:path`; those branches start folded).
 */
export interface DexNav { filter: string; kind: string; role: string; query: string; back: DexStep[]; focus: string | null; open: string[]; unfold: string[]; /** 상세검색: open/closed, the 기술로 찾기 text, the 내 판 chips on */ adv: boolean; skill: string; mine: string[] }

const DEX_BACK_MAX = 10;

export function dexNavStart(filter = 'all'): DexNav {
  return { filter, kind: 'all', role: 'all', query: '', back: [], focus: null, open: [], unfold: [], adv: false, skill: '', mine: [] };
}

/** Whether a dex entry shows under a filter and search (stage 1-2 data has neither, so everything shows). */
/** The criteria of the dex besides grade and name search; `state` is needed for `mine`. */
export interface DexMore { kind?: string; role?: string; skill?: string; mine?: readonly string[]; state?: GameState }

/** `DexNav.role` holds one role, several joined by commas ("slow,stun"), or 'all'. */
export function roleList(role: string | undefined): string[] {
  return !role || role === 'all' ? [] : role.split(',').filter(Boolean);
}

/** The 내 판 기준 chips: 조합 가능 (every material owned), 재료 1개 부족, 보유 재료 사용 (a material I own). */
export const MINE_KEYS = ['ready', 'one', 'uses'] as const;
export const MINE_LABEL: Record<string, string> = { ready: '조합 가능', one: '재료 1개 부족', uses: '보유 재료 사용' };

/** Whether a unit's recipe fits a 내 판 chip on this board (units without a recipe fit none). Board and storage both count. */
export function mineMatches(state: GameState, id: string, key: string): boolean {
  const recipe = state.data.recipes.find(r => r.result === id);
  if (!recipe) return false;
  if (key === 'uses') {
    const owned = new Set(boardUnits(state));
    return recipe.materials.some(m => owned.has(m));
  }
  const missing = missingMaterials(state, id).length;
  return key === 'ready' ? missing === 0 : key === 'one' ? missing === 1 : false;
}

export function dexShows(
  data: GameData, entry: Pick<DexEntry, 'grade' | 'hidden' | 'name' | 'recipe'> & Partial<Pick<DexEntry, 'kind' | 'roles' | 'search' | 'id'>>,
  filter: string, query: string, more: DexMore = {},
): boolean {
  // 계열 and 역할 apply to every unit set; grade and search only where the dex has them (stage 3 data)
  if (more.kind && more.kind !== 'all' && entry.kind !== more.kind) return false;
  // several roles ("slow,stun") must all be there
  if (!roleList(more.role).every(r => entry.roles?.some(t => t.role === r))) return false;
  const skill = (more.skill ?? '').replace(/\s+/g, '');
  if (skill && !entry.search?.includes(skill)) return false;
  if (more.mine?.length && !(entry.id && more.state && more.mine.every(k => mineMatches(more.state!, entry.id!, k)))) return false;
  if (!data.balance.extendedCombat) return true;
  if (filter === 'hidden' && !entry.hidden) return false;
  if (filter !== 'all' && filter !== 'hidden' && String(entry.grade) !== filter) return false;
  const needle = query.replace(/\s+/g, '');
  return !needle || [entry.name, ...entry.recipe].some(name => name.replace(/\s+/g, '').includes(needle));
}

/**
 * Follows a material link from `from` to `target`. When the filter or search would hide the target, the search is
 * dropped first, then the filter goes back to 전체, keeping whichever of the two still lets it show.
 */
export function dexGo(data: GameData, nav: DexNav, target: string, from: string, state?: GameState): DexNav {
  const entry = dexEntries(data).find(e => e.id === target);
  if (!entry) return nav;
  const back = [...nav.back, { id: from, filter: nav.filter, query: nav.query }].slice(-DEX_BACK_MAX);
  const tries: [string, string][] = [[nav.filter, nav.query], [nav.filter, ''], ['all', nav.query], ['all', '']];
  // 계열/역할 stay when they show the target; otherwise they are cleared before the grade and search are given up
  const found = tries.find(([f, q]) => dexShows(data, entry, f, q, { ...nav, state }));
  if (found) return { ...nav, filter: found[0], query: found[1], back, focus: target };
  const [filter, query] = tries.find(([f, q]) => dexShows(data, entry, f, q)) ?? ['all', ''];
  return { ...nav, filter, query, kind: 'all', role: 'all', skill: '', mine: [], back, focus: target };
}

/** Goes back to the entry the last material link was followed from, with its filter and search. */
export function dexBack(nav: DexNav): DexNav {
  const step = nav.back[nav.back.length - 1];
  if (!step) return nav;
  return { ...nav, filter: step.filter, query: step.query, back: nav.back.slice(0, -1), focus: step.id };
}

/** The key of a tree branch for `DexNav.unfold`. */
export const branchKey = (entry: string, path: string): string => `${entry}:${path}`;

/** Unfolds or folds the materials under a ✓ node (`key` from branchKey). */
export function dexFold(nav: DexNav, key: string): DexNav {
  return { ...nav, unfold: nav.unfold.includes(key) ? nav.unfold.filter(x => x !== key) : [...nav.unfold, key] };
}

/** Opens or closes an entry's material tree. */
export function dexToggle(nav: DexNav, id: string): DexNav {
  return { ...nav, open: nav.open.includes(id) ? nav.open.filter(x => x !== id) : [...nav.open, id] };
}
