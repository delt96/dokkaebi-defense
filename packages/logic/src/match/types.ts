import type { Command, Enemy, GameData, GameEvent, GameState, GroundFire, RejectReason, RngState } from '../types';

export type EliminationCause = 'limit' | 'boss' | 'forfeit' | 'disconnect';
export type BossStatus = 'pending' | 'fighting' | 'killed' | 'failed';
export interface BossClock { status: BossStatus; ticksLeft: number; pausedTicks: number; enemyId: number | null }
export interface SeatRecord { round: number; cause: EliminationCause | null; tick: number | null; lastEnemies: number; maxEnemies: number; series: number[]; helperOpens: number }
export interface SeatState {
  seat: number; alive: boolean; connected: boolean; disconnectTick: number | null;
  bosses: Record<number, BossClock>;
  supportTokens: number; receivedThisRound: boolean; supportSent: number; supportReceived: number;
  bestUnit: { defId: string; grade: number } | null; record: SeatRecord | null;
  yeoksinDamage: number[];
  lastSeq: number;
}
export interface YeoksinState { stage: number; enemy: Enemy; seat: number | null; enterTick: number }
export type TeamOutcome = 'clear' | 'wipe' | 'gate';
export type SeatOutcome = 'finished' | 'eliminated' | 'unfinished' | 'aliveTeamLoss';
export interface SeatResult {
  seat: number; outcome: SeatOutcome; cause: EliminationCause | null; round: number; lastEnemies: number; maxEnemies: number;
  series: number[]; bestUnit: { defId: string; grade: number } | null; yeoksinDamage: number; helperOpens: number;
}
export interface MatchResult { outcome: TeamOutcome; tick: number; round: number; yeoksinKills: number; started: number; alive: number; seats: SeatResult[] }
export interface MatchOptions { noElimination?: boolean; noGate?: boolean }
export interface TransferOffer { from: number; to: number; slot: number; unitId: number; tick: number }
export interface MatchEcon {
  rng: RngState; team: { streak: number; paid: boolean }; ssireumSeat: number | null;
  offers: TransferOffer[]; readyRound: Record<number, number>; rewarded: number[];
}
export interface MatchState {
  data: GameData; dataVersion: string; seed: number; ring: number[];
  tick: number; phase: 'prep' | 'round' | 'ended'; round: number; roundStartTick: number; roundEndTick: number;
  lanes: Record<number, GameState>; seats: Record<number, SeatState>;
  yeoksin: YeoksinState | null; yeoksinKills: number; result: MatchResult | null; options: MatchOptions;
  econ?: MatchEcon;
}
export type MatchCommand =
  | Command | { type: 'support'; target: number } | { type: 'forfeit' } | { type: 'disconnect' } | { type: 'reconnect' } | { type: 'invalid' }
  | { type: 'transferOffer'; target: number; slot: number; unitId: number } | { type: 'transferAccept'; slot: number }
  | { type: 'transferDecline' };
export interface MatchInput { seat: number; seq: number; cmd: MatchCommand }
export type Ack =
  | { seat: number; seq: number; tick: number; ok: true }
  | { seat: number; seq: number; tick: number; ok: false; reason: RejectReason };
export type MatchEvent =
  | { type: 'roundStart'; round: number }
  | { type: 'eliminated'; seat: number; cause: EliminationCause; round: number }
  | { type: 'disconnected'; seat: number } | { type: 'reconnected'; seat: number; alive: boolean }
  | { type: 'support'; from: number; to: number; coins: number }
  | { type: 'bossSpawn'; seat: number; round: number; enemyId: number } | { type: 'bossKilled'; seat: number; round: number }
  | { type: 'ssireumDraw'; seat: number }
  | { type: 'transferOffer'; from: number; to: number; defId: string; tick: number }
  | {
    type: 'transferEnd'; from: number; to: number; defId: string; outcome: 'accepted' | 'declined' | 'expired' | 'invalid';
    /** The seat that declined or dropped out; null when the offer was taken or ran out. */
    by: number | null;
    /** Why an invalid offer ended: a seat was eliminated or lost its connection, or the unit was gone. */
    cause: 'eliminated' | 'disconnected' | 'unitGone' | null;
  }
  | { type: 'yeoksinSpawn'; stage: number; maxHp: number }
  | { type: 'yeoksinEnter'; stage: number; seat: number; from: number | null; enterTick: number; hp: number; maxHp: number }
  | { type: 'yeoksinLeave'; stage: number; seat: number }
  | { type: 'yeoksinKilled'; stage: number; seat: number; topSeat: number | null }
  | { type: 'ended'; result: MatchResult };
export interface LaneStep { events: GameEvent[]; combatStart: number; newFires: GroundFire[] }
export interface StepMatchResult { tick: number; acks: Ack[]; lanes: Record<number, LaneStep>; events: MatchEvent[] }
