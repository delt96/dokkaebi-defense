export type DamageType = 'physical' | 'magical';
export type Trigger =
  | { kind: 'chance'; p: number } | { kind: 'nth'; n: number }
  | { kind: 'always' } | { kind: 'periodic'; seconds: number } | { kind: 'aura' };
export type Effect =
  | { kind: 'extraAttack' }
  | { kind: 'crit'; mult: number }
  | { kind: 'execute'; hpBelow: number; mult: number }
  | { kind: 'splash'; radius: number; mult: number }
  | { kind: 'pierce'; length: number; mult: number }
  | { kind: 'allInRange'; mult: number }
  | { kind: 'stun'; seconds: number }
  | { kind: 'slow'; pct: number; seconds: number; radius?: number }
  | { kind: 'knockback'; distance: number }
  | { kind: 'vuln'; pct: number; seconds: number; damageType: DamageType | 'all'; maxStacks?: number }
  | { kind: 'dot'; mult: number; seconds: number }
  | { kind: 'groundFire'; length: number; seconds: number; pulseMult: number }
  | { kind: 'onKillExplode'; radius: number; mult: number }
  | { kind: 'auraAttackSpeed'; pct: number }
  | { kind: 'auraAttackPower'; pct: number; damageType: DamageType | 'all' }
  | { kind: 'auraEnemyVuln'; pct: number };
export interface SkillDef { trigger: Trigger; effects: Effect[] }
export interface UnitDef { id: string; name: string; grade: number; damageType: DamageType; range: number; interval: number; factor: number; skills: SkillDef[] }
export interface RecipeDef { result: string; materials: string[] }
export interface EnemyDef { id: string; name: string; boss: boolean; shared?: boolean; hpMult: number; hp?: number; speed: number; resist: { physical: number; magical: number } }
export type WaveDef = { round: number; type: 'normal'; pattern: string[] } | { round: number; type: 'boss'; boss: string };
export interface BalanceDef {
  tickMs: number; prepSeconds: number; roundSeconds: number; bossRoundSeconds: number;
  spawnCount: number; spawnIntervalSeconds: number; rounds: number;
  hp: { base: number; coef: number; exp: number };
  gradeDps: { base: number; mult: number };
  tokens: { start: number; perRound: number; toCoins: number };
  coins: { perKill: number; roundEnd: number; boss: number };
  bossBuckwheat: number; sellPrice: number[]; limit: number; limitSeconds: number;
  summonOdds: number[]; pityEvery: number; grid: { cols: number; rows: number; initialOpenRows: number };
  bossCcFactor: number; vulnCap: number; auraRadius: number; pulseSeconds: number;
}
export type UpgradeId = 'physical' | 'magical' | 'polish' | 'slots';
export interface UpgradeDef { id: UpgradeId; label: string; max: number; costPerLevel: number; pct?: number; openCount?: number }
export interface YeoksinStageDef { stage: 1 | 2; enemy: string; startRound: number; deadlineRound: number; baseHp: number; startIndex: number }
export interface CoopDef {
  yeoksin: YeoksinStageDef[]; hpPerExtraPlayer: number; staySeconds: number;
  killReward: { coins: number; buckwheat: number }; topDamageBonus: number;
  support: { perRound: number; max: number; coins: number };
  disconnectSeconds: number; bossPauseCapSeconds: number; danger: number;
  maxCommandsPerTick: number; resultSeconds: number;
}
export interface GameData { units: UnitDef[]; recipes: RecipeDef[]; enemies: EnemyDef[]; waves: WaveDef[]; balance: BalanceDef; upgrades: UpgradeDef[]; coop?: CoopDef }

export interface RngState { s: number }
export interface Unit { id: number; defId: string; cooldown: number; attackCount: number; periodic: number[] }
export interface Vuln { pct: number; damageType: DamageType | 'all'; ticks: number; stacks: number }
export interface Dot { remaining: number; pulsesLeft: number; nextPulse: number }
export interface Enemy {
  id: number; defId: string; hp: number; maxHp: number; d: number; boss: boolean; round: number;
  stunTicks: number; slow: { pct: number; ticks: number } | null;
  vulns: Record<string, Vuln>; dots: Record<string, Dot>; fireHit: Record<string, number>;
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
}
export type Command =
  | { type: 'summon' } | { type: 'combine'; result: string; slot?: number; unitId?: number } | { type: 'sell'; slot: number; unitId?: number }
  | { type: 'move'; from: number; to: number; unitId?: number; toUnitId?: number | null } | { type: 'convertToken' }
  | { type: 'upgrade'; id: UpgradeId } | { type: 'helperOpened' };
export type RejectReason = 'ended' | 'noToken' | 'noSlot' | 'noUnit' | 'closedSlot' | 'missingMaterials' | 'noCoins' | 'maxed' | 'unknown'
  | 'notAlive' | 'notSpirit' | 'noSupportToken' | 'targetNotAlive' | 'targetAlreadyReceived' | 'staleUnit' | 'badArgs';
export type HitEffect = 'crit' | 'execute' | 'explosion';

export type GameEvent =
  | { type: 'roundStart'; round: number } | { type: 'spawn'; enemyId: number; defId: string }
  | { type: 'summon'; unitId: number; defId: string; grade: number; slot: number }
  | { type: 'combine'; replacedUnitId: number; unitId: number; defId: string; slot: number }
  | { type: 'attack'; unitId: number; enemyId: number }
  | { type: 'damage'; enemyId: number; amount: number; source: string; effect?: HitEffect }
  | { type: 'kill'; enemyId: number } | { type: 'speedChange'; enemyId: number; d: number; speed: number }
  | { type: 'ended'; result: GameResult };
export interface StepResult { events: GameEvent[]; rejected: { command: Command; reason: RejectReason }[] }
