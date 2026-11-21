import {
  attackIntervalTicks, damageBonus, speedBonus, unitAttack, countNormalEnemies, missingMaterials, recipesUsing, unitDefFast, upgradeCost,
  type Effect, type GameData, type GameState, type RecipeDef, type SkillDef, type StatusArea, type Trigger, type UnitDef, type UpgradeId,
} from '@dorandi/logic';

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

export function rightModel(state: GameState): { canSummon: boolean; canConvert: boolean; pending: number; bonusIn: number } {
  const live = state.phase !== 'ended' && state.tokens > 0;
  const freeCell = state.slots.some((u, i) => !u && state.open[i]);
  const { pityEvery } = state.data.balance;
  return {
    canSummon: live && freeCell, canConvert: live, pending: state.pendingPity.length,
    bonusIn: pityEvery - (state.grade1Summons % pityEvery),
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

/** `cost` is set on recipes with a cost (stage 3 grades 5 and 6), `short` when every material is there but the cost is not. */
export interface HelperItem { recipe: string; name: string; grade: number; cost?: string; short?: string }

/** Recipes that can be made now (in table order); stage 3 also lists those that only lack the cost, marked `short`. */
export function helperModel(state: GameState): HelperItem[] {
  const out: HelperItem[] = [];
  for (const recipe of state.data.recipes) {
    if (missingMaterials(state, recipe.result).length) continue;
    const cost = costText(recipe);
    const short = cost ? costShortText(state, recipe) : null;
    const def = unitDefFast(state.data, recipe.result);
    out.push({ recipe: recipe.result, name: def.name, grade: def.grade, ...(cost ? { cost } : {}), ...(short ? { short } : {}) });
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

/** `hidden`: a stage 3 hidden unit, which is tamed from a boss instead of summoned. */
export interface DexEntry {
  id: string; name: string; grade: number; recipe: string[]; hidden: boolean;
  typeText: string; range: number; skillText: string; cost: string | null; notes: string[];
}

export function dexEntries(data: GameData): DexEntry[] {
  const name = nameIn(data);
  return data.units.map(u => {
    const recipe = data.recipes.find(r => r.result === u.id);
    return {
      id: u.id, name: u.name, grade: u.grade, hidden: u.hidden === true,
      recipe: (recipe?.materials ?? []).map(name),
      typeText: typeName(u.damageType), range: u.range, skillText: unitSkillText(data, u), cost: costText(recipe),
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
