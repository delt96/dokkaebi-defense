import type { GameEvent, HitEffect, UpgradeId } from '../types';
import type { EconView } from '../econ/view';
import type { Ack, EliminationCause, MatchEvent, MatchResult } from './types';

// Server -> browser message names: 'lobby', 'full', 'tick', 'lane', 'mine', 'result' and the room notice 'notice'.
// Browser -> server: 'cmd' (WireCommand), 'ready' { ready }, 'start', 'watch' { seat }, 'rematch', 'resync'.

export interface UnitView { id: number; defId: string }
export interface EnemyView { id: number; defId: string; hp: number; maxHp: number; boss: boolean; shared: boolean; d: number; t: number; speed: number }
export interface FireView { source: string; from: number; to: number; endTick: number }
export interface LaneView { seat: number; tick: number; open: boolean[]; units: (UnitView | null)[]; enemies: EnemyView[]; fires: FireView[] }
export interface RowView {
  seat: number; name: string; status: 'alive' | 'spirit' | 'empty'; connected: boolean; reconnectTicksLeft: number | null;
  count: number; overLimitTicks: number; received: boolean; cause: EliminationCause | null; eliminatedTick: number | null;
}
export interface YeoksinView { stage: number; hp: number; maxHp: number; seat: number | null; enterTick: number; nextSeat: number | null }
/** stage 3 = both gates cleared. */
export interface GateView { stage: number; kills: number; deadlineTick: number | null }
export interface ClockView { tick: number; phase: 'prep' | 'round' | 'ended'; round: number; roundStartTick: number; roundEndTick: number }
/** The jige delivery as one seat sees it: its own and everyone's next allowed round, seats tied up in an offer, and its offer. */
export interface TransferMine {
  ready: number; readyRounds: Record<number, number>; busy: number[];
  offer: { from: number; to: number; defId: string; slot: number; unitId: number; deadlineTick: number } | null;
  rewarded: boolean; rewardsLeft: number;
  /** Ids of this seat's units that came by delivery (they cannot be sent on). */
  delivered: number[];
}
/** Stage 3 only: the lane economy plus the match parts one seat needs (delivery, team request night count). */
export interface EconMine extends EconView {
  transfer: TransferMine | null;
  team: { streak: number; paid: boolean } | null;
}
export interface MineView {
  tick: number; tokens: number; coins: number; buckwheat: number; upgrades: Record<UpgradeId, number>; pendingPity: string[];
  grade1Summons: number; helperOpens: number; supportTokens: number; received: boolean; lastSeq: number;
  open: boolean[]; units: (UnitView | null)[]; acks: Ack[]; supportIn: { from: number; coins: number }[];
  /** Left out entirely on rule data without an economy, so 20-round messages stay as they were. */
  econ?: EconMine;
  /** Stage 3: deliveries this seat took part in that ended on this tick, with the server's reason (only when there are some). */
  transferEnds?: TransferEndView[];
}
/** How a delivery ended, as the logic decided it (see MatchEvent 'transferEnd'). */
export type TransferEndView = Omit<Extract<MatchEvent, { type: 'transferEnd' }>, 'type'>;
export interface ClientView {
  n: number; dataVersion: string; clock: ClockView; rows: RowView[]; gate: GateView; yeoksin: YeoksinView | null;
  me: { seat: number; key: string }; mine: MineView; watching: number; lane: LaneView; result: MatchResult | null;
}
export type FullMsg = ClientView;
export interface TickMsg { n: number; clock: ClockView; rows: RowView[]; gate: GateView; yeoksin: YeoksinView | null }
export type LaneEvent =
  | { t: 'spawn'; id: number; defId: string; hp: number; maxHp: number; boss: boolean; d: number; speed: number }
  | { t: 'enter'; id: number; defId: string; hp: number; maxHp: number; d: number; speed: number }
  | { t: 'leave'; id: number } | { t: 'speed'; id: number; d: number; speed: number }
  | { t: 'damage'; id: number; amount: number; source: string; effect?: HitEffect } | { t: 'attack'; unitId: number; id: number }
  | { t: 'kill'; id: number } | { t: 'fire'; source: string; from: number; to: number; endTick: number }
  | { t: 'board'; open: boolean[]; units: (UnitView | null)[] } | { t: 'clear' }
  | { t: 'summon'; unitId: number; defId: string; grade: number; slot: number } | { t: 'combine'; unitId: number; defId: string; slot: number }
  // stage 3 only: an event enemy runs off or grows, and economy results the lane's owner is told about
  | { t: 'flee'; id: number } | { t: 'grow'; id: number; hp: number } | { t: 'note'; ev: EconNote };
/** Economy results streamed for messages on the owner's screen (purchases, rewards, requests, taming). */
export type EconNote = Extract<GameEvent, { type: 'buy' | 'questReward' | 'storyOffer' | 'storyEnd' | 'tame' }>;
export interface LaneBatch { tick: number; events: LaneEvent[] }
export interface LaneMsg { n: number; seat: number; batches: LaneBatch[] }
export type MineMsg = MineView;
export interface ResultMsg { result: MatchResult }
/** Rule data a room plays: 'stage2' is the 20-round game, 'stage3' the 60-round trial. */
export type MatchStage = 'stage2' | 'stage3';
export const MATCH_STAGES: readonly MatchStage[] = ['stage2', 'stage3'];
/** `stage` is left out by older servers; a missing value means 'stage2'. */
export interface LobbyMsg { roomId: string; you: number; hostSeat: number | null; seats: { seat: number; name: string; ready: boolean }[]; stage?: MatchStage }
export type NoticeMsg =
  | { kind: 'replaced' } | { kind: 'rematch'; roomId: string; hostToken?: string }
  | { kind: 'rematchReady'; seats: number[] }
  | { kind: 'roomError'; reason: 'notHost' | 'notReady' | 'notInLobby' };
export interface WireCommand { seq: number; type: string; args?: Record<string, unknown> }
export type JoinErrorName = 'badName' | 'dupName' | 'roomFull' | 'alreadyStarted' | 'badKey';
export const JOIN_ERROR_CODES: Record<JoinErrorName, number> = { badName: 4101, dupName: 4102, roomFull: 4103, alreadyStarted: 4104, badKey: 4105 };
