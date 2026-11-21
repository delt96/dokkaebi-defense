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
  hidden?: boolean; onBasicHit?: { targetPct: number; splashPct: number }; lineage?: DamageType[];
}
export interface RecipeDef { result: string; materials: string[]; cost?: { buckwheat?: number; coins?: number } }
export interface BossControlDef { windowTicks: number; stunTicks: number; pushDistance: number; maxStoppedShare: number }
export interface BossControlLog {
  alive: number; stopped: number; stunLog: number[]; pushLog: [number, number][];
  stunClipped: number; pushClipped: number; entranceClipped: number; pushApplied: number; maxWindowStopped: number;
}
export interface EnemyDef { id: string; name: string; boss: boolean; shared?: boolean; event?: true; hpMult: number; hp?: number; speed: number; resist: { physical: number; magical: number } }
export type WaveDef = { round: number; type: 'normal'; pattern: string[] } | { round: number; type: 'boss'; boss: string };
export interface BalanceDef {
  tickMs: number; prepSeconds: number; roundSeconds: number; bossRoundSeconds: number;
  spawnCount: number; spawnIntervalSeconds: number; rounds: number;
  hp: { base: number; coef: number; exp: number };
  gradeDps: { base: number; mult: number };
  tokens: { start: number; perRound: number; toCoins: number };
  coins: { perKill: number; roundEnd: number; boss: number };
  bossBuckwheat: number; sellPrice: number[]; limit: number; limitSeconds: number;
  summonOddsByRound?: { fromRound: number; odds: number[] }[];
  summonOdds: number[]; pityEvery: number; grid: { cols: number; rows: number; initialOpenRows: number };
  bossCcFactor: number; vulnCap: number; auraRadius: number; pulseSeconds: number;
  onBasicHitRadius?: number; auraCaps?: { attackSpeed: number; attackPower: number };
  inheritUpgrades?: boolean; periodicReady?: boolean; extendedCombat?: boolean; bossControl?: BossControlDef;
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

export type EconItem = 'bundle' | 'jar';
export type GeneralQuestId = 'mission' | 'collection' | 'team' | 'ssireum';
export type EconSection = 'market' | 'drops' | 'story' | GeneralQuestId | 'shadow' | 'tame' | 'transfer';
export interface TameTargetDef {
  enemy: string; unit: string; cost: { buckwheat?: number; coins?: number; tokens?: number };
  needs?: 'slowed' | { vulnSource: string; stacks: number };
}
export interface EconomyDef {
  ledger: { tokenValue: number; storyCap: number; totalCap: number; ratio: number };
  market?: {
    dayRounds: number; jigeChance: number;
    bundle: { price: number; perDay: number; deck: number[] };
    jar: { price: number; firstChance: number; periodRounds: number; perPeriod: number };
  };
  drops?: { round: number; grade: number }[];
  story?: { checks: { round: number; recordRounds: number[] }[]; kills: number; fee: { coins: number; buckwheat: number }; maxAwards: number };
  mission?: { round: number; entrySeconds: number; fee: number; enemy: string; kills: number; reward: { coins: number; buckwheat: number } };
  collection?: { fromRound: number; toRound: number; items: string[]; coins: number };
  team?: { fromRound: number; toRound: number; perSurvivor: number; nights: number; tokens: number };
  ssireum?: { round: number; enemy: string; seconds: number; buckwheat: number };
  shadow?: { round: number; enemy: string; growSeconds: number; grownHp: number; coins: number; grownCoins: number };
  tame?: { hpPct: number; targets: TameTargetDef[] };
  transfer?: { offerSeconds: number; cooldownRounds: number; maxGrade: number; reward: number; rewardCap: number };
}
export type StoryEndReason = 'award' | 'declined' | 'targetChanged' | 'lostMaterial' | 'gotMaterial' | 'kills' | 'funds' | 'cap';
export interface StoryState {
  target: string | null; pinned: number[];
  log: { round: number; target: string; missing: number | null }[];
  offers: number; awarded: boolean;
  active: { target: string; missing: number; round: number } | null;
}
export interface EconState {
  rng: { bundle: RngState; jar: RngState; jige: RngState; drop: RngState };
  roundKills: number; questTokens: number;
  ledger: { story: number; tokens: number };
  pityQuest: boolean[]; pendingDrops: string[];
  bundle: { day: number; bought: number; left: number[] };
  jar: { period: number; done: number; missed: boolean };
  jige: boolean;
  story: StoryState;
  mission: { phase: 'idle' | 'active' | 'won' | 'lost'; beastId: number | null; beastDown: boolean };
  collection: { done: string[]; paid: boolean };
  events: { id: number; kind: 'beast' | 'ssireum' | 'shadow'; spawnTick: number; grown: boolean }[];
  tamed: string[];
}

export interface RngState { s: number }
export interface Unit {
  id: number; defId: string; cooldown: number; attackCount: number; periodic: number[];
  chargeTicks?: number; charged?: boolean; streak?: { enemyId: number; count: number };
  neighborHits?: number; neighborLockUntil?: number; explodeReadyTick?: number;
  cost?: number; locked?: true; delivered?: true;
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
  data: GameData; tick: number; phase: 'prep' | 'round' | 'ended';
  round: number; roundStartTick: number; roundEndTick: number; spawned: number;
  result: GameResult | null;
  tokens: number; coins: number; buckwheat: number;
  slots: (Unit | null)[]; open: boolean[];
  pendingPity: string[]; summonCounts: Record<string, number>; grade1Summons: number;
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
  | { type: 'buy'; item: EconItem } | { type: 'storyTarget'; id: string | null; unitIds?: number[] } | { type: 'storyDecline' }
  | { type: 'missionEnter' } | { type: 'tame'; enemyId: number };
export type RejectReason = 'ended' | 'noToken' | 'noSlot' | 'noUnit' | 'closedSlot' | 'missingMaterials' | 'noCoins' | 'noBuckwheat' | 'maxed' | 'unknown'
  | 'notAlive' | 'notSpirit' | 'noSupportToken' | 'targetNotAlive' | 'targetAlreadyReceived' | 'staleUnit' | 'badArgs'
  | 'marketClosed' | 'soldOut' | 'badTarget' | 'notOffered' | 'missionClosed' | 'noTarget' | 'tameHp' | 'tameCondition'
  | 'locked' | 'busy' | 'targetBusy' | 'targetAway' | 'cooldown' | 'noJige' | 'noOffer';
export type HitEffect = 'crit' | 'execute' | 'explosion';

export type GameEvent =
  | { type: 'roundStart'; round: number } | { type: 'spawn'; enemyId: number; defId: string }
  | { type: 'summon'; unitId: number; defId: string; grade: number; slot: number }
  | { type: 'combine'; replacedUnitId: number; unitId: number; defId: string; slot: number }
  | { type: 'attack'; unitId: number; enemyId: number }
  | { type: 'damage'; enemyId: number; amount: number; source: string; effect?: HitEffect }
  | { type: 'kill'; enemyId: number } | { type: 'speedChange'; enemyId: number; d: number; speed: number }
  | { type: 'ended'; result: GameResult }
  | { type: 'buy'; item: EconItem; defId: string | null; buckwheat: number; jige: boolean }
  | { type: 'storyOffer'; target: string; missing: string; round: number }
  | { type: 'storyEnd'; target: string; reason: StoryEndReason }
  | { type: 'questReward'; quest: GeneralQuestId | 'story' | 'transfer'; coins: number; buckwheat: number; tokens: number }
  | { type: 'tame'; enemyId: number; defId: string; unitId: number; slot: number }
  | { type: 'grow'; enemyId: number; hp: number } | { type: 'flee'; enemyId: number };
export interface StepResult { events: GameEvent[]; rejected: { command: Command; reason: RejectReason }[] }
