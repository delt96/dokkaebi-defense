export type DamageType = 'physical' | 'magical';
export type StatusArea = { radius?: number; area?: 'hit' | 'others' };
export type Trigger =
  | { kind: 'chance'; p: number } | { kind: 'nth'; n: number; phase?: number }
  | { kind: 'always' } | { kind: 'periodic'; seconds: number } | { kind: 'aura' }
  | { kind: 'charge'; seconds: number } | { kind: 'streak'; n: number }
  | { kind: 'targetHpBelow'; pct: number } | { kind: 'targetSlowed' }
  | { kind: 'neighborHits'; count: number; lockoutSeconds: number };
export type Effect =
  | { kind: 'extraAttack' }
  | { kind: 'crit'; mult: number }
  | { kind: 'execute'; hpBelow: number; mult: number }
  | { kind: 'splash'; radius: number; mult: number; radiusCycle?: number[]; stunnedBonus?: { mult: number; graceSeconds: number } }
  | { kind: 'pierce'; length: number; mult: number; both?: boolean; knockedBonus?: number }
  | { kind: 'allInRange'; mult: number }
  | { kind: 'strike'; mult: number }
  | { kind: 'chain'; range: number; mult: number; maxBounces: number }
  | { kind: 'rampCrit'; step: number; max: number }
  | ({ kind: 'stun'; seconds: number } & StatusArea)
  | ({ kind: 'slow'; pct: number; seconds: number } & StatusArea)
  | ({ kind: 'knockback'; distance: number } & StatusArea)
  | ({ kind: 'vuln'; pct: number; seconds: number; damageType: DamageType | 'all'; maxStacks?: number; source?: string } & StatusArea)
  | ({ kind: 'dot'; mult: number; seconds: number } & StatusArea)
  | { kind: 'groundFire'; length: number; seconds: number; pulseMult: number; align?: 'center' | 'ahead' | 'behind' }
  | { kind: 'onKillExplode'; radius: number; mult: number; requireExecute?: boolean }
  | { kind: 'onVulnKillExplode'; radius: number; mult: number; cooldownSeconds: number }
  | { kind: 'auraAttackSpeed'; pct: number; damageType?: DamageType }
  | { kind: 'auraAttackPower'; pct: number; damageType: DamageType | 'all'; source?: string }
  | { kind: 'auraEnemyVuln'; pct: number; damageType?: DamageType; source?: string }
  | { kind: 'coinOnFirstHit'; coins: number }
  | { kind: 'coinTimer'; everySeconds: number; coins: number; maxPerRound: number };
export interface SkillDef { trigger: Trigger; effects: Effect[] }
export interface UnitDef {
  id: string; name: string; grade: number; damageType: DamageType; range: number; interval: number; factor: number; skills: SkillDef[];
  hidden?: boolean; onBasicHit?: { targetPct: number; splashPct: number };
}
/** kind 'tame': a stage 3 exclusive recipe, one tamed recruit (grade 4 hidden) and one normal grade 5 into a hidden grade 6. */
export interface RecipeDef { result: string; materials: string[]; cost?: { buckwheat?: number; coins?: number }; kind?: 'tame' }
export interface BossControlDef { windowTicks: number; stunTicks: number; pushDistance: number; maxStoppedShare: number }
export interface BossControlLog {
  alive: number; stopped: number; stunLog: number[]; pushLog: [number, number][];
  stunClipped: number; pushClipped: number; entranceClipped: number; pushApplied: number; maxWindowStopped: number;
}
export interface EnemyDef { id: string; name: string; boss: boolean; shared?: boolean; event?: true; hpMult: number; hp?: number; speed: number; resist: { physical: number; magical: number } }
export type WaveDef = { round: number; type: 'normal'; pattern: string[] } | { round: number; type: 'boss'; boss: string };
/**
 * `frame`: the area the enemy path runs around (defaults to cols x rows, which every stage uses today). The slots
 * upgrade opens its openCount cells per level after the initial rows, the last level stopping at the board's end.
 */
export interface GridDef {
  cols: number; rows: number; initialOpenRows: number;
  frame?: { cols: number; rows: number };
}
export const DIFFICULTIES = ['easy', 'normal', 'hard'] as const;
export type Difficulty = typeof DIFFICULTIES[number];
export function isDifficulty(value: unknown): value is Difficulty {
  return DIFFICULTIES.some(d => d === value);
}

export interface BalanceDef {
  defaultDifficulty?: Difficulty;
  difficulties?: Record<Difficulty, { tokensPerRound: number }>;
  tickMs: number; prepSeconds: number; roundSeconds: number; bossRoundSeconds: number;
  spawnCount: number; spawnIntervalSeconds: number; rounds: number;
  hp: { base: number; coef: number; exp: number };
  gradeDps: { base: number; mult: number };
  tokens: { start: number; perRound: number; toCoins: number };
  coins: { perKill: number; roundEnd: number; boss: number };
  bossBuckwheat: number; sellPrice: number[]; limit: number; limitSeconds: number;
  summonOddsByRound?: { fromRound: number; odds: number[] }[];
  summonOdds: number[]; pityEvery: number; grid: GridDef;
  bossCcFactor: number; vulnCap: number; auraRadius: number; pulseSeconds: number;
  onBasicHitRadius?: number; auraCaps?: { attackSpeed: number; attackPower: number };
  periodicReady?: boolean; extendedCombat?: boolean; bossControl?: BossControlDef;
}
export type UpgradeId = 'physical' | 'magical' | 'polish' | 'slots';
export interface UpgradeDef { id: UpgradeId; label: string; max: number; costPerLevel: number; pct?: number; openCount?: number }
export interface YeoksinStageDef { stage: number; enemy: string; startRound: number; deadlineRound: number; baseHp: number; startIndex: number }
export interface CoopDef {
  yeoksin: YeoksinStageDef[]; hpPerExtraPlayer: number; staySeconds: number;
  killReward: { coins: number; buckwheat: number }; topDamageBonus: number;
  support: { perRound: number; max: number; coins: number };
  disconnectSeconds: number; bossPauseCapSeconds: number; danger: number;
  maxCommandsPerTick: number; resultSeconds: number;
}
export interface GameData {
  units: UnitDef[]; recipes: RecipeDef[]; enemies: EnemyDef[]; waves: WaveDef[]; balance: BalanceDef; upgrades: UpgradeDef[];
  coop?: CoopDef; economy?: EconomyDef;
}

export interface JigeSource { zone: 'board' | 'storage'; index: number; unitId: number }
export type GeneralQuestId = 'collection' | 'team' | 'ssireum';
export type EconSection = 'market' | 'drops' | GeneralQuestId | 'shadow' | 'tame' | 'hunts';
export type QuestId = GeneralQuestId | 'shadow';
/** How a quest stands for one seat; 'active' until it settles. */
export type QuestOutcome = 'active' | 'won' | 'missedEntry' | 'timedOut' | 'otherSeat' | 'fled' | 'capped' | 'eliminated' | 'tamed';
/** The last counts of a quest, frozen when it settles (only the fields of its kind are set). */
export interface QuestProgress {
  done?: string[];
  remaining?: number; survivors?: number; streak?: number;
  winnerSeat?: number; grown?: boolean; tamedDefId?: string;
}
export interface QuestRecord { outcome: QuestOutcome; reward: { coins: number; buckwheat: number; tokens: number }; progress: QuestProgress }
export interface TameTargetDef {
  enemy: string; unit: string; cost: { buckwheat?: number; coins?: number; tokens?: number };
  needs?: 'slowed' | { vulnSource: string; stacks: number };
}
/**
 * A repeatable 격파 target: summoned into the caller's own lane from `fromRound`, it must die within the time limit.
 * Level n has round(hp × hpGrowth^(n-1)) HP and pays reward.buckwheat 묵 plus reward.coins + coinsPerLevel × (n-1) 냥.
 */
export interface HuntTargetDef {
  enemy: string; fromRound: number; hp: number; fee: number;
  reward: { buckwheat: number; coins: number; coinsPerLevel: number };
}
export interface HuntsDef { seconds: number; cooldownSeconds: number; hpGrowth: number; targets: HuntTargetDef[] }
/** One seat's record of one 격파 target: the next level, the living summon and when a new summon opens. */
export interface HuntSeat {
  level: number; enemyId: number | null; deadlineTick: number; readyTick: number;
  last: 'won' | 'fled' | 'tamed' | null;
}
export type GambleTable = 'small' | 'big';
export type GambleUnitResult = 0 | 3 | 4 | 5 | 6 | 'hidden';
export interface GambleOdds<T> { result: T; chance: number }
export interface GambleDef {
  coins: { stakes: number[]; perRound: number; bigMultiplier: number; outcomes: GambleOdds<number>[] };
  units: {
    perRound: number; bigGrade: number;
    tables: Record<GambleTable, { buckwheatCost: number; consolation: number; fromRound: number; outcomes: GambleOdds<GambleUnitResult>[] }>;
  };
}
export interface EconomyDef {
  startingBuckwheat: number;
  ledger: { tokenValue: number; totalCap: number; ratio: number };
  market?: {
    jigeChance: number; maxSwapGrade: number;
    /** Draws stay locked until this round's personal boss is killed or tamed. */
    openAfterBossRound?: number;
    gamble?: GambleDef;
  };
  drops?: { round: number; grade: number }[];
  collection?: { fromRound: number; toRound: number; items: string[]; coins: number };
  team?: { fromRound: number; toRound: number; perSurvivor: number; nights: number; tokens: number };
  ssireum?: { round: number; enemy: string; seconds: number; buckwheat: number };
  shadow?: { round: number; enemy: string; growSeconds: number; grownHp: number; coins: number; grownCoins: number };
  hunts?: HuntsDef;
  /** hpBands: ascending inclusive upper bounds of remaining HP / max HP, the last one 1. */
  tame?: { hpBands: { upTo: number; chance: number }[]; failureHealPct: number; cooldownSeconds: number; targets: TameTargetDef[] };
}
export interface EconState {
  rng: { jige: RngState; drop: RngState; tame: RngState; gambleCoins?: RngState; gambleUnit?: RngState };
  roundKills: number; questTokens: number;
  ledger: { tokens: number };
  pendingDrops: string[];
  gamble?: { round: number; coins: number; units: number };
  /** False until the boss named by market.openAfterBossRound is killed or tamed; missing (older snapshots) means open. */
  marketOpen?: boolean;
  jige: number;
  collection: { done: string[]; paid: boolean };
  events: { id: number; kind: 'ssireum' | 'shadow'; spawnTick: number; grown: boolean }[];
  /** 격파 targets by enemy id; missing (older snapshots) or a missing entry means never summoned (level 1, ready). */
  hunts?: Record<string, HuntSeat>;
  tamed: string[];
  /** Targets that refused a recruit: the tick a new attempt opens. */
  tameReady: { enemyId: number; tick: number }[];
  /** One record per quest this seat met, kept after the round moves on. */
  questResults: Partial<Record<QuestId, QuestRecord>>;
}

export interface RngState { s: number }
export interface Unit {
  id: number; defId: string; cooldown: number; attackCount: number; periodic: number[];
  chargeTicks?: number; charged?: boolean; streak?: { enemyId: number; count: number };
  neighborHits?: number; neighborLockUntil?: number; explodeReadyTick?: number;
  cost?: number;
}
export interface Vuln { pct: number; damageType: DamageType | 'all'; ticks: number; stacks: number }
export interface Dot { remaining: number; pulsesLeft: number; nextPulse: number }
export interface Enemy {
  id: number; defId: string; hp: number; maxHp: number; d: number; boss: boolean; round: number;
  stunTicks: number; slow: { pct: number; ticks: number } | null;
  vulns: Record<string, Vuln>; dots: Record<string, Dot>; fireHit: Record<string, number>;
  stunEndTick?: number; knockedRound?: number;
  vulnCaster?: { unitId: number; attack: number; key: string }; ctl?: BossControlLog;
}
export interface GroundFire { source: string; from: number; to: number; basePerPulse: number; nextPulse: number; endTick: number }
export interface RoundStats { round: number; hpSpawned: number; damageDealt: number; damageInRound: number; maxEnemies: number; endEnemies: number; bossKillSeconds: number | null }
export interface GameResult { outcome: 'clear' | 'defeat'; reason: 'limit' | 'boss' | null; round: number }
export interface GameState {
  difficulty?: Difficulty;
  data: GameData; tick: number; phase: 'prep' | 'round' | 'ended';
  round: number; roundStartTick: number; roundEndTick: number; spawned: number;
  result: GameResult | null;
  tokens: number; coins: number; buckwheat: number;
  slots: (Unit | null)[]; open: boolean[];
  /** Grade 1-2 units the player put away off the board (no attacks, no auras); absent until first used. */
  storage?: Unit[];
  summonCounts: Record<string, number>; grade1Summons: number;
  enemies: Enemy[]; fires: GroundFire[];
  upgrades: Record<UpgradeId, number>;
  overLimitTicks: number; helperOpens: number;
  stats: RoundStats[];
  rng: { summon: RngState; combat: RngState };
  nextId: number;
  income?: { round: number; firstHit: Record<string, true>; timerTicks: Record<string, number>; timerPaid: Record<string, number> };
  econ?: EconState;
}
export type Command =
  | { type: 'summon' } | { type: 'combine'; result: string; slot?: number; unitId?: number } | { type: 'sell'; slot: number; unitId?: number }
  | { type: 'move'; from: number; to: number; unitId?: number; toUnitId?: number | null } | { type: 'convertToken' }
  | { type: 'upgrade'; id: UpgradeId } | { type: 'helperOpened' }
  | { type: 'jigeSwap'; source: JigeSource; result: string }
  | GambleCommand
  | { type: 'hunt'; enemy: string } | { type: 'tame'; enemyId: number }
  | { type: 'store'; slot: number; unitId?: number } | { type: 'storeAll' }
  | { type: 'retrieve'; defId: string; slot?: number } | { type: 'sellStored'; defId: string };
export type GambleCommand = { type: 'gambleCoins'; stake: number } | { type: 'gambleUnit'; table: GambleTable };
export type GambleEvent =
  | { type: 'gambleCoins'; stake: number; multiplier: number; payout: number }
  | ({ type: 'gambleUnit'; table: GambleTable; buckwheatCost: number; consolation: number; jige: boolean } & (
    { result: 0; defId?: never; unitId?: never } |
    { result: Exclude<GambleUnitResult, 0>; defId: string; unitId: number }
  ));
export type RejectReason = 'ended' | 'noToken' | 'noSlot' | 'noUnit' | 'closedSlot' | 'missingMaterials' | 'noCoins' | 'noBuckwheat' | 'maxed' | 'unknown'
  | 'notAlive' | 'notSpirit' | 'noSupportToken' | 'targetNotAlive' | 'targetAlreadyReceived' | 'staleUnit' | 'badArgs'
  | 'marketClosed' | 'marketLocked' | 'gambleRound' | 'gambleLimit' | 'huntClosed' | 'huntOut' | 'noTarget' | 'tameCondition'
  | 'cooldown' | 'noJige'
  | 'notStorable' | 'nothingToStore' | 'notStored' | 'slotTaken';
export type HitEffect = 'crit' | 'execute' | 'explosion';

export type GameEvent =
  | GambleEvent
  | { type: 'roundStart'; round: number }
  /** `hp` only when the spawn does not use the data's HP for the round (a 격파 target's level). */
  | { type: 'spawn'; enemyId: number; defId: string; hp?: number }
  | { type: 'summon'; unitId: number; defId: string; grade: number; slot: number }
  | { type: 'combine'; replacedUnitId: number; unitId: number; defId: string; slot: number }
  | { type: 'attack'; unitId: number; enemyId: number }
  | { type: 'damage'; enemyId: number; amount: number; source: string; effect?: HitEffect }
  | { type: 'kill'; enemyId: number } | { type: 'speedChange'; enemyId: number; d: number; speed: number }
  | { type: 'ended'; result: GameResult }
  | { type: 'jigeSwap'; source: JigeSource; unitId: number; defId: string }
  | { type: 'questReward'; quest: GeneralQuestId; coins: number; buckwheat: number; tokens: number }
  | { type: 'tame'; enemyId: number; defId: string; unitId: number; slot: number }
  /** One paid attempt: the odds shown before the roll, what was spent, and whether it worked. */
  | { type: 'tameTry'; enemyId: number; defId: string; chance: number; success: boolean; buckwheat: number; coins: number; tokens: number }
  | { type: 'grow'; enemyId: number; hp: number } | { type: 'flee'; enemyId: number }
  /** A 격파 target of `level` died in time (paid) or ran out of time (nothing). */
  | { type: 'hunt'; enemy: string; level: number; outcome: 'won' | 'fled'; coins: number; buckwheat: number };
export interface StepResult { events: GameEvent[]; rejected: { command: Command; reason: RejectReason }[] }
