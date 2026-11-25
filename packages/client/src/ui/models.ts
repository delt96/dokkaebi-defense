import { difficultySuffix } from './difficulty';
import {
  attackIntervalTicks, damageBonus, laneOf, speedBonus, unitAttack, combineLockRound, combinePlan, countNormalEnemies, missingMaterials, storedMaterials, availableRecipes, unitDefFast,
  upgradeCost, summonOddsForRound, roundResistRange,
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
 * extendedCombat, which spells out the radius of area slows (stage 1-2 text stays as it was). `zoneSlow` is the
 * stage 3 slow factor: a slow then reaches its board quadrant at its pct times the factor.
 */
export interface SkillCtx {
  interval: number; pulseSeconds: number; nameOf?: (id: string) => string; extended?: boolean; auraRadius?: number; zoneSlow?: number;
}

/**
 * Attack range in the board's own cells. Combat measures it in path units, a straight line from the cell centre to the
 * enemy; a board with more cells than its frame draws them smaller (lane pitch < 1), so the same range spans more cells.
 */
export const attackRangeText = (data: GameData, range: number): string =>
  `${Math.round((range / laneOf({ data }).pitch) * 10) / 10}칸`;
export const ATTACK_RANGE_HINT = '칸 가운데에서 적까지 잰 직선거리입니다. 유닛을 고르면 닿는 길이 노랗게 보입니다.';

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
    case 'slow':
      if (ctx?.zoneSlow !== undefined) return `구역 둔화 ${pct(e.pct * ctx.zoneSlow)} ${e.seconds}초`;
      // stage 1-2 slows with a radius keep their old wording
      return `${e.radius ? (ctx?.extended ? areaText(e) : '주변 ') : areaText(e)}둔화 ${pct(e.pct)} ${e.seconds}초`;
    case 'knockback': return `${areaText(e)}${e.distance}칸 밀어냄`;
    case 'vuln': return `${areaText(e)}받는 ${typeName(e.damageType)} +${pct(e.pct)} ${e.seconds}초${paren(e.maxStacks && `최대 ${e.maxStacks}중첩`, sourceNote(e.source, ctx))}`;
    case 'dot': return areaText(e) + dotText(e, trigger, ctx);
    case 'groundFire': return fireText(e);
    case 'onKillExplode': return `${e.requireExecute ? '처형으로 ' : ''}처치하면 주변 폭발 ${pct(e.mult)}`;
    case 'auraAttackSpeed': return `주변 ${ctx?.auraRadius === undefined ? '' : `${ctx.auraRadius}칸 `}${e.damageType ? `${typeName(e.damageType)} ` : ''}아군 공격 속도 +${pct(e.pct)}`;
    case 'auraAttackPower': return `주변 ${ctx?.auraRadius === undefined ? '' : `${ctx.auraRadius}칸 `}${e.damageType === 'all' ? '' : `${typeName(e.damageType)} `}아군 공격력 +${pct(e.pct)}${paren(sourceNote(e.source, ctx))}`;
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
  return {
    interval: def.interval, pulseSeconds: data.balance.pulseSeconds, nameOf: nameIn(data), extended: data.balance.extendedCombat === true,
    auraRadius: data.balance.auraRadius, zoneSlow: data.balance.zoneSlow?.pctFactor,
  };
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

/** The upgrade a unit reads: its own damage type's, never its materials'. */
export const upgradeLine = (def: UnitDef): string => `${typeName(def.damageType)} 강화를 받음`;

/** Stage 3 notes under a unit: which upgrade it reads, and the aura caps. Empty for stage 1-2 data. */
export function unitNotes(data: GameData, def: UnitDef): string[] {
  const out: string[] = [];
  if (data.balance.extendedCombat) out.push(upgradeLine(def));
  const caps = data.balance.auraCaps;
  if (caps && def.skills.some(s => s.effects.some(e => e.kind === 'auraAttackSpeed' || e.kind === 'auraAttackPower'))) {
    out.push(`오라는 종류마다 한 번만, 합쳐서 공격 속도 +${pct(caps.attackSpeed)}·공격력 +${pct(caps.attackPower)}까지`);
  }
  return out;
}

export interface CombineNotes { upgrade: string; range: number; lostAuras: string[]; lostControls: string[]; inherited: string[] }

/**
 * Stage 3 combine card (v5 6장 "도감 도움말"): the upgrade the result reads and its range, the materials' auras and
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
  return {
    upgrade: upgradeLine(def), range: def.range, lostAuras, inherited,
    lostControls: [...controls].map(([c, who]) => `${c} (${who.join(', ')})`),
  };
}

/** Inherited lines read like the material's own effect: no source note, no re-applied dot note, stage 3 radii. */
const INHERIT_CTX = (data: GameData): SkillCtx => ({
  interval: Number.POSITIVE_INFINITY, pulseSeconds: data.balance.pulseSeconds, extended: true, auraRadius: data.balance.auraRadius,
  zoneSlow: data.balance.zoneSlow?.pctFactor,
});

/**
 * The combine notes as card lines; empty for stage 1-2. `spec`: the 상세 window's recipes show the result's own stats and
 * skills instead, so its range line and the lost-control line (which the result's skills already answer) are left out.
 */
export function combineNoteLines(data: GameData, result: string, spec = false): string[] {
  const n = combineNotes(data, result);
  if (!n) return [];
  const lines = spec ? [] : [`사거리 ${attackRangeText(data, n.range)}`];
  if (n.inherited.length) lines.push(`이어받는 지원 효과: ${n.inherited.join(' / ')}`);
  if (n.lostAuras.length) lines.push(`조합하면 사라지는 오라: ${n.lostAuras.join(' / ')}`);
  if (n.lostControls.length && !spec) lines.push(`조합하면 사라지는 제어: ${n.lostControls.join(', ')}`);
  return lines;
}

/** What a unit is before upgrades and auras: the numbers a recipe compares against the unit it starts from. */
export interface BaseSpec { attack: number; interval: number; range: number; skills: string[]; roles: RoleTag[] }

export function baseSpec(data: GameData, id: string): BaseSpec {
  const def = unitDefFast(data, id);
  const text = unitSkillText(data, def);
  return {
    attack: Math.round(unitAttack(def, data.balance)), interval: attackIntervalTicks(def.interval, 0) * data.balance.tickMs / 1000, range: def.range,
    skills: text ? text.split(' / ') : [], roles: unitRoles(def),
  };
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

/** "20라운드부터" while a recipe is shut until a round, else what the player is short of to pay for it. */
function blockedText(state: GameState, recipe: RecipeDef | undefined): string | null {
  const from = combineLockRound(state, recipe);
  return from !== null ? `${from}라운드부터` : costShortText(state, recipe);
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

/**
 * What a press on the board (or M, Esc) means for press-to-move. `press`: a drag started on a unit; `again`: a short
 * press on the unit already selected; `tap`: a cell, another unit or outside the grid; `toggle`: M; `cancel`: Esc or a right click.
 */
export type MoveInput =
  | { kind: 'press'; slot: number }
  | { kind: 'again'; slot: number }
  | { kind: 'tap'; slot: number | null }
  | { kind: 'toggle' }
  | { kind: 'cancel' };
/** `select`: the slot to select (null drops the selection); absent keeps it. */
export interface MoveStep { moving: boolean; select?: number | null; move?: { from: number; to: number } }

export function moveStep(state: GameState, selected: number | null, moving: boolean, input: MoveInput): MoveStep {
  if (input.kind === 'toggle') return { moving: selected !== null && !moving };
  if (input.kind === 'cancel') return selected !== null && moving ? { moving: false } : { moving: false, select: null };
  if (selected === null || !moving) {
    return input.kind === 'again' && selected !== null ? { moving: true } : { moving: false, select: input.slot };
  }
  const to = input.slot;
  if (to === null || to === selected || !state.open[to]) return { moving: false };
  return { moving: false, move: { from: selected, to } };
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

export function rightModel(state: GameState): { canSummon: boolean; canConvert: boolean } {
  const live = state.phase !== 'ended' && state.tokens > 0;
  const freeCell = state.slots.some((u, i) => !u && state.open[i]);
  return {
    canSummon: live && freeCell, canConvert: live,
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
  marketLocked: '10라운드 보스를 잡은 뒤에 열립니다',
  gambleRound: '아직 큰 보따리를 열 수 없습니다',
  gambleLimit: '이번 라운드 도박 횟수를 다 썼습니다',
  huntClosed: '아직 열리지 않은 격파입니다',
  huntOut: '이미 나와 있습니다',
  noTarget: '길들일 대상이 사라졌습니다',
  tameHp: '아직 체력이 높습니다',
  tameCondition: '길들이기 조건이 풀렸습니다',
  cooldown: '아직 다시 시도할 수 없습니다',
  noJige: '지게가 없습니다',
  tameLocked: '길들인 유닛 조합은 아직 열리지 않았습니다',
  // storage
  notStorable: '1·2등급만 보관할 수 있습니다',
  nothingToStore: '보관할 1·2등급 유닛이 없습니다',
  notStored: '보관함에 없는 유닛입니다',
  slotTaken: '그 칸에는 이미 유닛이 있습니다',
};

export function rejectText(reason: string): string | null {
  return REJECT_TEXT[reason] ?? null;
}

/**
 * The 60-round resistance of `round`'s enemies, from the same rule combat uses: "저항 물리 32% · 마법 20%", a range
 * when the wave mixes enemies ("물리 20~70%"). Null without growing resistance or while every resist is 0.
 */
export function resistText(data: GameData, round: number): string | null {
  const r = roundResistRange(data, Math.max(1, round));
  if (!r || [...r.physical, ...r.magical].every(x => Math.round(x * 100) === 0)) return null;
  const span = ([lo, hi]: [number, number]) => (Math.round(lo * 100) === Math.round(hi * 100) ? pct(lo) : `${Math.round(lo * 100)}~${pct(hi)}`);
  return `저항 물리 ${span(r.physical)} · 마법 ${span(r.magical)}`;
}

/** The 장승 word for `n` enemies: a lane loses only above the limit, so the limit itself is 한계, not 무너짐. */
export function crackText(n: number, limit: number): string {
  if (n > limit) return '무너짐';
  if (n === limit) return '한계';
  const r = n / limit;
  return r > 0.66 ? '금 감' : r > 0.33 ? '흔들림' : '멀쩡함';
}

/** A board cell as the market and the 지게 window name it: "2행 3열". */
export const cellText = (cols: number, index: number): string => `${Math.floor(index / cols) + 1}행 ${index % cols + 1}열`;

export type LimitLevel = 'ok' | 'warn' | 'danger' | 'over';

/**
 * The one grading of an enemy count the HUD, the online rows, the 장승 and the board edge read. A lane loses only above
 * the limit, so the limit itself is still danger. `instant`: from `limitInstantFromRound` on, the first enemy over loses.
 */
export function limitLevel(data: GameData, count: number, round: number): { level: LimitLevel; instant: boolean } {
  const { limit, limitInstantFromRound } = data.balance;
  const warn = data.coop?.danger ?? Math.ceil(limit * 0.8);
  const danger = Math.ceil(limit * 0.95);
  const level: LimitLevel = count > limit ? 'over' : count >= danger ? 'danger' : count >= warn ? 'warn' : 'ok';
  return { level, instant: limitInstantFromRound !== undefined && round >= limitInstantFromRound };
}

export function limitTail(level: LimitLevel, count: number, limit: number): string | null {
  switch (level) {
    case 'ok': return null;
    case 'warn': return '주의';
    case 'danger': return count >= limit ? '한계' : `${limit - count}마리 남음`;
    case 'over': return '초과';
  }
}

export interface HudModel {
  roundText: string; secondsLeft: number; enemyText: string; danger: number; crack: string; resistText: string | null;
  count: number; limit: number; level: LimitLevel; instant: boolean; tail: string | null;
  /** the '장승 …' word hides in danger, where the tail already says it */
  crackShown: boolean; overBy: number;
  /** Null without a living boss. Shortened to '보스 N' while the resist line or the danger tail needs the room. */
  bossText: string | null; bossTitle: string | null;
}

export function hudModel(state: GameState): HudModel {
  const b = state.data.balance;
  const n = countNormalEnemies(state);
  const ticksPerSecond = 1000 / b.tickMs;
  const prepTicks = b.prepSeconds * ticksPerSecond;
  const left = state.phase === 'prep' ? prepTicks - state.tick : state.roundEndTick - state.tick;
  const { level, instant } = limitLevel(state.data, n, state.round);
  const resist = resistText(state.data, state.round);
  const boss = state.enemies.find(e => e.boss && e.hp > 0);
  const bossTitle = boss ? `보스 체력 ${boss.hp} / ${boss.maxHp}` : null;
  const tail = limitTail(level, n, b.limit);
  return {
    roundText: (state.phase === 'prep' ? '준비' : `${state.round} / ${b.rounds} 라운드`) + difficultySuffix(state.data, state.difficulty),
    secondsLeft: Math.max(0, Math.ceil(left / ticksPerSecond)),
    enemyText: `내 잡귀 ${n} / ${b.limit}`,
    danger: Math.min(1, n / b.limit),
    crack: crackText(n, b.limit),
    resistText: resist,
    count: n, limit: b.limit, level, instant, tail,
    crackShown: level !== 'danger', overBy: level === 'over' ? n - b.limit : 0,
    // any count tail, not only the danger one: round 10 with a tail and the pause pill measured 654-663px of 638 in Malgun Gothic
    bossText: boss && (resist !== null || tail !== null) ? `보스 ${boss.hp}` : bossTitle,
    bossTitle,
  };
}

/**
 * `cost` is set on recipes with a cost (stage 3 grades 5 and 6), `short` when every material is there but the cost is not,
 * `stored` when some materials would come out of storage (how many).
 */
export interface HelperItem { recipe: string; name: string; grade: number; materials: Material[]; cost?: string; short?: string; stored?: number }

/**
 * A recipe material as the chips draw it; `have` is false for the copies the board and storage cannot cover.
 * `mark` 'share': the rows in `takenBy` (top first) use this copy up before this row; 'make': a ready recipe yields this missing material.
 */
export interface Material { id: string; name: string; grade: number; have: boolean; mark?: 'share' | 'make'; takenBy?: string[] }

/** `missingIds` is what missingMaterials returns: the last copies of a material are the missing ones. */
export function materialsOf(state: GameState, result: string, missingIds: readonly string[]): Material[] {
  const recipe = state.data.recipes.find(r => r.result === result);
  if (!recipe) return [];
  const seen = new Map<string, number>();
  return recipe.materials.map(id => {
    const k = seen.get(id) ?? 0;
    seen.set(id, k + 1);
    const total = recipe.materials.filter(m => m === id).length;
    const lacking = missingIds.filter(m => m === id).length;
    const { name, grade } = unitDefFast(state.data, id);
    return { id, name, grade, have: k < total - lacking };
  });
}

const COMBINE_KEYS: readonly ComboKey[] = ['Z', 'X', 'C'];

/** `short` describes any currency shortfall. */
export interface CombineOption { result: string; name: string; grade: number; missing: string[]; materials: Material[]; key: 'Z' | 'X' | 'C' | null; cost?: string; short?: string }

function optionFor(state: GameState, result: string, missing: readonly string[]): CombineOption {
  const { name, grade } = unitDefFast(state.data, result);
  const recipe = state.data.recipes.find(r => r.result === result);
  const cost = costText(recipe);
  const short = blockedText(state, recipe);
  return {
    result, name, grade,
    missing: missing.map(id => unitDefFast(state.data, id).name),
    materials: materialsOf(state, result, missing),
    key: null,
    ...(cost ? { cost } : {}),
    ...(short ? { short } : {}),
  };
}

const ready = (option: CombineOption) => !option.missing.length && !option.short;

/** Recipes a stored kind can go into right now (board units first, then storage, as the combine command takes them). */
export function storedCombineOptions(state: GameState, defId: string): CombineOption[] {
  return state.data.recipes.filter(r => r.materials.includes(defId))
    .map(r => optionFor(state, r.result, missingMaterials(state, r.result))).filter(ready);
}

export type NextScope = 'unit' | 'all';
export type NextGroup = 'target' | 'ready' | 'one' | 'far';
/** uses: the selected unit is one of the materials. */
export interface NextRow extends CombineOption { group: NextGroup; uses: boolean }
/** `far` (unit scope only): recipes two or more materials short. `counts`: ready rows (no shortfall) per scope, `unit` null with nothing selected. */
export interface NextList {
  scope: NextScope; rows: NextRow[]; far: NextRow[];
  counts: { unit: number | null; all: number };
  target: { id: string; name: string } | null;
}
export interface NextOpts { target?: string | null; slot?: number | null; scope?: NextScope }

/** Recipe results of the target tree's missing nodes, each at its shallowest depth. */
function targetDepths(state: GameState, target: string | null): Map<string, number> {
  const depths = new Map<string, number>();
  const tree = target ? pinnedTarget(state.data, target, state.slots, state.storage ?? [], state) : null;
  let level = tree ? [tree] : [];
  for (let depth = 0; level.length; depth++) {
    for (const node of level) if (node.location === 'missing' && node.children.length && !depths.has(node.id)) depths.set(node.id, depth);
    level = level.flatMap(node => node.children);
  }
  return depths;
}

/** Ready rows take their materials from the board and storage top down; a copy left with nothing to take is 'share'. */
function markShares(state: GameState, rows: readonly NextRow[]): void {
  const left = new Map<string, number>();
  for (const u of state.slots) if (u) left.set(u.defId, (left.get(u.defId) ?? 0) + 1);
  for (const u of state.storage ?? []) left.set(u.defId, (left.get(u.defId) ?? 0) + 1);
  const takers = new Map<string, string[]>();
  for (const row of rows) {
    if (!ready(row)) continue;
    for (const m of row.materials) {
      const n = left.get(m.id) ?? 0;
      if (n > 0) {
        left.set(m.id, n - 1);
        const by = takers.get(m.id) ?? [];
        if (!by.includes(row.result)) takers.set(m.id, [...by, row.result]);
      } else {
        m.mark = 'share';
        m.takenBy = (takers.get(m.id) ?? []).filter(r => r !== row.result);
      }
    }
  }
}

/** The one "what to combine next" list the helper, the unit panel, the keys and the board marks all read. */
export function nextCombines(state: GameState, opts: NextOpts = {}): NextList {
  const slot = opts.slot ?? null;
  const unitDef = slot === null ? null : state.slots[slot]?.defId ?? null;
  const scope: NextScope = unitDef === null ? 'all' : opts.scope ?? 'unit';
  const tableOrder = new Map(state.data.recipes.map((r, i) => [r.result, i]));
  const depths = targetDepths(state, opts.target ?? null);
  const makeable = new Set(availableRecipes(state));
  const byGrade = (a: NextRow, b: NextRow) => b.grade - a.grade || tableOrder.get(a.result)! - tableOrder.get(b.result)!;

  const groups: Record<NextGroup, NextRow[]> = { target: [], ready: [], one: [], far: [] };
  const lacking = new Map<string, string>();
  let all = 0;
  let unit = 0;
  for (const recipe of state.data.recipes) {
    const missing = missingMaterials(state, recipe.result);
    const uses = unitDef !== null && recipe.materials.includes(unitDef);
    const option = optionFor(state, recipe.result, missing);
    if (ready(option)) { all++; if (uses) unit++; }
    if (scope === 'unit' && !uses) continue;
    const group: NextGroup = depths.has(recipe.result) && missing.length <= 1 ? 'target'
      : !missing.length ? 'ready' : missing.length === 1 ? 'one' : 'far';
    if (group === 'far' && scope === 'all') continue;
    if (missing.length === 1) lacking.set(recipe.result, missing[0]!);
    groups[group].push({ ...option, group, uses });
  }
  groups.target.sort((a, b) => depths.get(a.result)! - depths.get(b.result)! || byGrade(a, b));
  groups.ready.sort((a, b) => Number(!!a.short) - Number(!!b.short) || byGrade(a, b));
  const unmakeable = (row: NextRow) => Number(!makeable.has(lacking.get(row.result)!));
  groups.one.sort((a, b) => unmakeable(a) - unmakeable(b) || byGrade(a, b));

  const rows = [...groups.target, ...groups.ready, ...groups.one];
  markShares(state, rows);
  for (const row of rows) {
    if (row.missing.length !== 1) continue;
    for (const m of row.materials) if (!m.have && makeable.has(m.id)) m.mark = 'make';
  }
  if (unitDef !== null) {
    let next = 0;
    for (const row of rows) if (row.uses && ready(row)) row.key = COMBINE_KEYS[next++] ?? null;
  }
  const target = opts.target && tableOrder.has(opts.target) ? { id: opts.target, name: unitDefFast(state.data, opts.target).name } : null;
  return { scope, rows, far: groups.far, counts: { unit: unitDef === null ? null : unit, all }, target };
}

export type ComboKey = 'Z' | 'X' | 'C';
/** What the board draws from the next list: `triangles` (first one breathes), the selected unit's partner cells and stacks, the hovered row's cells. */
export interface BoardMarks {
  triangles: number[];
  pairs: { slot: number; key: ComboKey }[];
  stored: { defId: string; key: ComboKey }[];
  focus: number[] | null;
}
export const NO_MARKS: BoardMarks = { triangles: [], pairs: [], stored: [], focus: null };

/** Ready rows whose result lands on a board slot; a recipe made only from storage has no slot to mark or pick. */
function boardReady(state: GameState, list: NextList): { result: string; slot: number }[] {
  const out: { result: string; slot: number }[] = [];
  for (const row of list.rows) {
    if (!ready(row)) continue;
    const slot = combinePlan(state, row.result)?.resultSlot ?? null;
    if (slot !== null) out.push({ result: row.result, slot });
  }
  return out;
}

export function boardMarks(state: GameState, list: NextList, slot: number | null): BoardMarks {
  if (slot === null) {
    const triangles: number[] = [];
    for (const r of boardReady(state, list)) {
      if (triangles.length >= 3) break;
      if (!triangles.includes(r.slot)) triangles.push(r.slot);
    }
    return { triangles, pairs: [], stored: [], focus: null };
  }
  const pairs: BoardMarks['pairs'] = [];
  const stored: BoardMarks['stored'] = [];
  const storage = state.storage ?? [];
  for (const row of list.rows) {
    if (!row.key) continue;
    const plan = combinePlan(state, row.result, slot);
    if (!plan) continue;
    for (const i of plan.board) if (i !== slot && !pairs.some(p => p.slot === i)) pairs.push({ slot: i, key: row.key });
    for (const j of plan.stored) {
      const defId = storage[j]!.defId;
      if (!stored.some(s => s.defId === defId)) stored.push({ defId, key: row.key });
    }
  }
  pairs.sort((a, b) => a.slot - b.slot);
  return { triangles: [], pairs, stored, focus: null };
}

/**
 * Board cells the combine command would take for `result`, the selected slot left out. A row that cannot combine yet
 * (a material missing) gets the board cells holding the materials it has, so hovering it still lights them.
 */
export function rowCells(state: GameState, result: string, slot: number | null): number[] {
  const plan = combinePlan(state, result, slot ?? undefined);
  if (plan) return plan.board.filter(i => i !== slot);
  const recipe = state.data.recipes.find(r => r.result === result);
  if (!recipe) return [];
  const chosen = slot === null ? null : state.slots[slot];
  if (slot !== null && (!chosen || !recipe.materials.includes(chosen.defId))) return [];
  const used = new Set<number>(slot === null ? [] : [slot]);
  let selfTaken = slot === null;
  const cells: number[] = [];
  for (const m of recipe.materials) {
    if (!selfTaken && chosen!.defId === m) { selfTaken = true; continue; }
    for (let i = state.slots.length - 1; i >= 0; i--) {
      if (used.has(i) || state.slots[i]?.defId !== m) continue;
      used.add(i);
      cells.push(i);
      break;
    }
  }
  return cells;
}

/** W: the ready row after `after` in list order (wrapping), with the slot its result lands on. */
export function nextPick(state: GameState, list: NextList, after: string | null): { result: string; slot: number } | null {
  const picks = boardReady(state, list);
  if (!picks.length) return null;
  const at = after === null ? -1 : picks.findIndex(p => p.result === after);
  return picks[at < 0 ? 0 : (at + 1) % picks.length]!;
}

const plainOption = ({ group: _g, uses: _u, ...option }: NextRow): CombineOption => option;

/** Every recipe the unit in `slot` goes into, in next-list order (the far ones last). */
export function combineOptions(state: GameState, slot: number, target?: string | null): CombineOption[] {
  if (!state.slots[slot]) return [];
  const list = nextCombines(state, { target, slot, scope: 'unit' });
  return [...list.rows, ...list.far].map(plainOption);
}

/** Recipes whose materials are all there, in next-list order; stage 3 also lists those that only lack the cost, marked `short`. */
export function helperModel(state: GameState, target?: string | null): HelperItem[] {
  return nextCombines(state, { target }).rows.filter(row => !row.missing.length).map(row => {
    const stored = storedMaterials(state, row.result);
    return {
      recipe: row.result, name: row.name, grade: row.grade, materials: row.materials,
      ...(row.cost ? { cost: row.cost } : {}), ...(row.short ? { short: row.short } : {}), ...(stored ? { stored } : {}),
    };
  });
}

const UPGRADE_TARGET: Record<UpgradeId, string> = { physical: '물딜 공격력', magical: '마딜 공격력', polish: '1~4등급 공격력' };

/** Levels add up (pct × level), so the row says the total now and after the next level. */
function upgradeEffectText(id: UpgradeId, p: number, level: number, max: number): string {
  const total = (n: number) => `+${Math.round(p * n * 100)}%`;
  return level >= max ? `${UPGRADE_TARGET[id]} ${total(level)} · 최대` : `${UPGRADE_TARGET[id]} 지금 ${total(level)} → 다음 ${total(level + 1)}`;
}

/** What the 강화 window weighs against: this round's resistance and how many board units each damage upgrade reaches. */
export function upgradeInfoText(state: GameState): string {
  const defs = state.slots.flatMap(u => (u ? [unitDefFast(state.data, u.defId)] : []));
  const count = (type: DamageType) => defs.filter(d => d.damageType === type).length;
  const resist = resistText(state.data, state.round);
  return [resist ? `이번 라운드 ${resist}` : null, `내 물딜 ${count('physical')}기 · 마딜 ${count('magical')}기`].filter(Boolean).join(' · ');
}

export function upgradeRows(state: GameState): { id: UpgradeId; label: string; level: number; max: number; cost: number | null; effectText: string; affordable: boolean }[] {
  return state.data.upgrades.map(def => {
    const level = state.upgrades[def.id];
    const cost = level >= def.max ? null : upgradeCost(def, level + 1);
    return {
      id: def.id, label: def.label, level, max: def.max, cost,
      effectText: upgradeEffectText(def.id, def.pct ?? 0, level, def.max),
      affordable: cost !== null && state.coins >= cost,
    };
  });
}

/**
 * What the bottom card and the 상세 window show for a board unit. `attack` and `interval` already count upgrades and auras;
 * `attackBonus` / `speedBonus` are those bonuses as fractions (0.3 = +30%). `hidden`: a stage 3 unit tamed from a boss.
 */
export interface UnitCard {
  name: string; grade: number; hidden: boolean; typeText: '물딜' | '마딜'; skillText: string; notes: string[]; usedIn: string[]; roles: RoleTag[];
  attack: number; attackBonus: number; interval: number; speedBonus: number; range: number; sellPrice: number;
}

export function unitCard(state: GameState, slot: number): UnitCard | null {
  const unit = state.slots[slot];
  if (!unit) return null;
  const def = unitDefFast(state.data, unit.defId);
  const usedIn: string[] = [];
  for (const r of state.data.recipes) {
    if (!r.materials.includes(def.id)) continue;
    const name = unitDefFast(state.data, r.result).name;
    if (!usedIn.includes(name)) usedIn.push(name);
  }
  const attackBonus = damageBonus(state, slot);
  const fast = speedBonus(state, slot);
  return {
    name: def.name, grade: def.grade, hidden: def.hidden === true, typeText: def.damageType === 'physical' ? '물딜' : '마딜',
    attack: Math.round(unitAttack(def, state.data.balance) * (1 + attackBonus)), attackBonus,
    interval: attackIntervalTicks(def.interval, fast) * state.data.balance.tickMs / 1000, speedBonus: fast,
    range: def.range, skillText: unitSkillText(state.data, def), notes: unitNotes(state.data, def), usedIn, roles: unitRoles(def),
    sellPrice: state.data.balance.sellPrice[def.grade - 1] ?? 0,
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
  /** a tamed recruit: the exclusive recipes it goes into */
  makesIds: string[];
}

/** Words people search by that the skill text spells another way. */
const SEARCH_ALIAS: [text: string, alias: string][] = [['스턴', '기절'], ['관통', '꿰뚫']];

/** The string 기술로 찾기 looks in: the skill text a card shows, the role names (물깎 …) and the aliases it needs. */
export function skillSearchText(skillText: string, roles: readonly RoleTag[]): string {
  const aliases = SEARCH_ALIAS.filter(([t]) => skillText.includes(t)).map(([, a]) => a);
  return [skillText, ...roles.map(t => ROLE_LABEL[t.role]), ...aliases].join(' ').replace(/\s+/g, '');
}

/**
 * Where a hidden unit is tamed: the enemy and when it first shows up ("지네각시 · 10라운드 보스"). The wave table, the 격파
 * targets and the one-off 씨름·그늘 rounds are the places an enemy can come from. Null for a unit no enemy turns into.
 */
export function tameSourceText(data: GameData, unitId: string): string | null {
  const eco = data.economy;
  const texts = (eco?.tame?.targets ?? []).filter(t => t.unit === unitId).map(t => {
    const name = data.enemies.find(e => e.id === t.enemy)?.name ?? t.enemy;
    const wave = data.waves.find(w => (w.type === 'boss' ? w.boss === t.enemy : w.pattern.includes(t.enemy)));
    const hunt = eco?.hunts?.targets.find(h => h.enemy === t.enemy);
    const event = [eco?.ssireum, eco?.shadow].find(e => e?.enemy === t.enemy);
    const when = wave ? `${wave.round}라운드${wave.type === 'boss' ? ' 보스' : '부터'}`
      : hunt ? `${hunt.fromRound}라운드부터 격파` : event ? `${event.round}라운드` : null;
    return when ? `${name} · ${when}` : name;
  });
  return texts.length ? texts.join(', ') : null;
}

export function dexEntries(data: GameData): DexEntry[] {
  const name = nameIn(data);
  return data.units.map(u => {
    const recipe = data.recipes.find(r => r.result === u.id);
    return {
      id: u.id, name: u.name, grade: u.grade, hidden: u.hidden === true,
      recipe: (recipe?.materials ?? []).map(name), recipeIds: [...(recipe?.materials ?? [])],
      kind: u.damageType, roles: unitRoles(u),
      makesIds: u.hidden ? data.recipes.filter(r => r.kind === 'tame' && r.materials.includes(u.id)).map(r => r.result) : [],
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
  const tree = materialTree(data, id);
  if (!tree) return null;
  const reserve = materialPool(board);
  markMaterials(tree.children, node => reserve(node.id));
  return tree.children;
}

function materialTree(data: GameData, id: string): RecipeNode | null {
  const recipeOf = (unit: string) => data.recipes.find(r => r.result === unit);
  if (!recipeOf(id)) return null;
  const build = (unit: string, depth: number, path: string): RecipeNode => {
    const def = unitDefFast(data, unit);
    const recipe = recipeOf(unit);
    return {
      id: unit, name: def.name, grade: def.grade, hidden: def.hidden === true, cost: costText(recipe), path, mark: 'missing',
      children: recipe && depth < TREE_DEPTH ? recipe.materials.map((m, i) => build(m, depth + 1, path ? `${path}.${i}` : String(i))) : [],
    };
  };
  return build(id, 0, '');
}

function materialPool(ids: readonly string[]): (id: string) => boolean {
  const pool = new Map<string, number>();
  for (const id of ids) pool.set(id, (pool.get(id) ?? 0) + 1);
  return id => {
    const count = pool.get(id) ?? 0;
    if (!count) return false;
    pool.set(id, count - 1);
    return true;
  };
}

function markMaterials(top: RecipeNode[], reserve: (node: RecipeNode) => boolean): void {
  const cover = (node: RecipeNode) => { node.mark = 'covered'; node.children.forEach(cover); };
  let level = top;
  while (level.length) {
    const next: RecipeNode[] = [];
    for (const node of level) {
      if (reserve(node)) {
        node.mark = 'have';
        node.children.forEach(cover);
      } else next.push(...node.children);
    }
    level = next;
  }
}

type MaterialLocation = 'board' | 'storage' | 'missing';
/**
 * `ready`: not owned, but every material it still needs is on the board or in storage, so it can be combined now.
 * `blocked`: those materials are all there, but `pay` cannot cover the combine or its round has not come ("20라운드부터").
 */
export interface TargetNode {
  id: string; name: string; grade: number; location: MaterialLocation; ready: boolean; blocked: string | null; children: TargetNode[];
}

export function pinnedTarget(
  data: GameData, id: string, board: readonly ({ defId: string } | null)[], storage: readonly { defId: string }[] = [], pay?: GameState,
): TargetNode | null {
  const tree = materialTree(data, id);
  if (!tree) return null;
  const fromBoard = materialPool(board.flatMap(unit => unit ? [unit.defId] : []));
  const fromStorage = materialPool(storage.map(unit => unit.defId));
  const locations = new Map<RecipeNode, MaterialLocation>();
  markMaterials([tree], node => {
    const location = fromBoard(node.id) ? 'board' : fromStorage(node.id) ? 'storage' : 'missing';
    locations.set(node, location);
    return location !== 'missing';
  });
  const display = (node: RecipeNode): TargetNode => {
    const location = locations.get(node) ?? 'missing';
    const children = node.children.filter(child => child.mark !== 'covered').map(display);
    const onHand = location === 'missing' && children.length > 0 && children.every(child => child.location !== 'missing');
    const blocked = onHand && pay ? blockedText(pay, data.recipes.find(r => r.result === node.id)) : null;
    return { id: node.id, name: node.name, grade: node.grade, location, ready: onHand && blocked === null, blocked, children };
  };
  return display(tree);
}

/** Def ids of the units a combine can use: the board's, then the stored ones. */
export function boardUnits(state: GameState): string[] {
  return [...state.slots.flatMap(u => (u ? [u.defId] : [])), ...(state.storage ?? []).map(u => u.defId)];
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

/** Where a material link came from, to go back to it with the list as it was (every criterion a link may clear). */
export interface DexStep { id: string; filter: string; query: string; kind?: string; role?: string; skill?: string; mine?: string[] }

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
  const back = [...nav.back, { id: from, filter: nav.filter, query: nav.query, kind: nav.kind, role: nav.role, skill: nav.skill, mine: nav.mine }].slice(-DEX_BACK_MAX);
  const tries: [string, string][] = [[nav.filter, nav.query], [nav.filter, ''], ['all', nav.query], ['all', '']];
  // 계열/역할 stay when they show the target; otherwise they are cleared before the grade and search are given up
  const found = tries.find(([f, q]) => dexShows(data, entry, f, q, { ...nav, state }));
  if (found) return { ...nav, filter: found[0], query: found[1], back, focus: target };
  const [filter, query] = tries.find(([f, q]) => dexShows(data, entry, f, q)) ?? ['all', ''];
  return { ...nav, filter, query, kind: 'all', role: 'all', skill: '', mine: [], back, focus: target };
}

/** Goes back to the entry the last material link was followed from, with its filter, search and the other criteria. */
export function dexBack(nav: DexNav): DexNav {
  const step = nav.back[nav.back.length - 1];
  if (!step) return nav;
  return {
    ...nav, filter: step.filter, query: step.query, kind: step.kind ?? nav.kind, role: step.role ?? nav.role, skill: step.skill ?? nav.skill,
    mine: step.mine ?? nav.mine, back: nav.back.slice(0, -1), focus: step.id,
  };
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
