import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  birthOf, buildFull, buildTick, createMatch, gambleTier, jumpToTick, loadGameData, MatchStreamer, normalizeNickname, parseClientCommand, sameNickname, stepMatch,
  isDifficulty, type Difficulty, MATCH_STAGES, type InputLogEntry, type JoinErrorName, type LaneBatch, type LobbyMsg, type MatchInput, type MatchStage, type MatchState, type NoticeMsg,
  type MatchResult, type RecordedMatch, type ResultMsg,
} from '@dorandi/logic';
import { playLogLines } from '../playLog';

// Resolve once at process start so an existing room keeps its release identity.
export const rulesRevision = process.env.DORANDI_RULES_REVISION ?? execFileSync('git', ['rev-parse', 'HEAD'], {
  encoding: 'utf8', cwd: new URL('.', import.meta.url),
}).trim();
if (!/^[0-9a-f]{40}$/.test(rulesRevision)) throw new Error('빌드 버전을 확인해 주세요.');

const MAX_SEATS = 6;
const TICK_MS = 50;
const LOBBY_REFRESH_GRACE_MS = 15_000;

export interface ClientLink { id: string; send(type: string, msg: unknown): void; close(code?: number): void }
export interface RoomDeps {
  now(): number; random128(): string; randomSeed(): number;
  createRematchRoom(opts: { hostToken: string; keepOpenMs: number; stage?: MatchStage; difficulty?: Difficulty }): Promise<string>;
  setAutoDispose(v: boolean): void; dispose(): void; dev: boolean;
  /** One line per room event for the hosting dashboard; never carries player names. */
  log?(line: string): void;
}

const DIFFICULTY_TEXT: Record<Difficulty, string> = { easy: '쉬움', normal: '보통', hard: '어려움', hell: '지옥' };
const OUTCOME_TEXT: Record<MatchResult['outcome'], string> = { clear: '클리어', wipe: '전멸', gate: '관문 실패' };
/** keepOpenMs: a rematch lobby stays open while empty for this long (the rest of the old room's result hold, capped at the full hold). */
/** stage: the rule data the room starts with (the host can change it in the lobby); a rematch room gets the old room's. */
export interface RoomOptions { seed?: number; hostToken?: string; devJumpTick?: number; devNoElimination?: boolean; keepOpenMs?: number; stage?: MatchStage; difficulty?: Difficulty }

export function isMatchStage(v: unknown): v is MatchStage {
  return typeof v === 'string' && (MATCH_STAGES as readonly string[]).includes(v);
}
export interface JoinOptions { name?: unknown; rejoinKey?: unknown; hostToken?: unknown }

export class JoinError extends Error {
  constructor(public reason: JoinErrorName) {
    super(reason);
    this.name = 'JoinError';
  }
}

interface LobbySeat { seat: number; name: string; ready: boolean; linkId: string }

/** Transport-free room rules: lobby, start, the fixed-step match loop and (Task 13) rejoin and rematch. */
export class RoomCore {
  phase: 'lobby' | 'playing' | 'result' | 'closed' = 'lobby';
  match: MatchState | null = null;
  /** Seat -> lobby entry; frozen as the match roster on start. */
  readonly seats = new Map<number, LobbySeat>();
  /** Connected link id -> link and seat. */
  readonly links = new Map<string, { link: ClientLink; seat: number }>();
  hostSeat: number | null = null;
  /** Rule data for the match; chosen by the host in the lobby, fixed once the match starts. */
  stage: MatchStage;
  difficulty?: Difficulty;
  names: Record<number, string> = {};
  keys: Record<number, string> = {};
  /** Seat -> the lane that seat's player is shown (a living seat always watches its own lane). */
  watching: Record<number, number> = {};
  /** Input log: one entry per tick that had inputs, in server arrival order. */
  readonly log: InputLogEntry[] = [];
  /** Update number carried by the last `tick`/`lane` pair. */
  n = 0;

  private queue: MatchInput[] = [];
  private streamer: MatchStreamer | null = null;
  /** Lane seat -> event batches since the last `lane` message. */
  private pending = new Map<number, LaneBatch[]>();
  private lastTickAt = 0;
  private resultAt = 0;
  /** Link ids that get a `full` at the end of the next tick (rejoins during play); they get no stream messages before it. */
  private awaitingFull = new Set<string>();
  private readonly rematchReady = new Set<number>();
  /** The one rematch room, created on the first press. */
  private rematch: { hostSeat: number; hostToken: string; roomId: Promise<string> } | null = null;
  /**
   * Seat -> the key that seat used for its last rejoin, still accepted until the new link sends a message after its
   * `full` (the browser stores the new key only on that `full`, so a drop before it must not lose the seat).
   */
  private readonly prevKeys = new Map<number, { key: string; linkId: string }>();
  /** Deadline for an empty lobby to accept returning players or later rematch pressers. */
  private keepOpenUntil: number | null = null;
  private sawSix = false;

  constructor(readonly roomId: string, readonly deps: RoomDeps, readonly options: RoomOptions = {}) {
    this.stage = options.stage ?? 'stage2';
    if (options.difficulty !== undefined && (this.stage !== 'stage3' || !isDifficulty(options.difficulty))) {
      throw new Error('잘못된 난이도입니다.');
    }
    if (this.stage === 'stage3') this.difficulty = options.difficulty ?? 'normal';
    deps.log?.('[방] 새 방');
    const keep = options.keepOpenMs;
    if (keep !== undefined && keep > 0) {
      this.keepOpenUntil = deps.now() + Math.min(keep, loadGameData('stage2').coop!.resultSeconds * 1000);
      deps.setAutoDispose(false);
    }
  }

  join(link: ClientLink, opts: JoinOptions): void {
    if (this.phase !== 'lobby') {
      // A started room only takes rejoin keys; a nickname alone never gets a seat back.
      if (opts.rejoinKey === undefined || opts.rejoinKey === null) throw new JoinError('alreadyStarted');
      return this.rejoin(link, opts.rejoinKey);
    }
    const name = normalizeNickname(opts.name);
    if (name === null) throw new JoinError('badName');
    for (const s of this.seats.values()) if (sameNickname(s.name, name)) throw new JoinError('dupName');
    let seat = 0;
    for (let i = 1; i <= MAX_SEATS; i++) if (!this.seats.has(i)) { seat = i; break; }
    if (seat === 0) throw new JoinError('roomFull');

    this.seats.set(seat, { seat, name, ready: false, linkId: link.id });
    this.links.set(link.id, { link, seat });
    const tokenHost = this.options.hostToken !== undefined && opts.hostToken === this.options.hostToken;
    if (this.hostSeat === null || tokenHost) this.hostSeat = seat;
    this.broadcastLobby();
  }

  leave(linkId: string, consented: boolean): void {
    const entry = this.links.get(linkId);
    if (!entry) return;
    this.links.delete(linkId);
    this.awaitingFull.delete(linkId);
    // An explicit give-up arrives first as a `forfeit` command, so every leave during play is a disconnect.
    if (this.phase === 'playing') this.queue.push({ seat: entry.seat, seq: 0, cmd: { type: 'disconnect' } });
    if (this.phase !== 'lobby') return;
    this.seats.delete(entry.seat);
    if (this.seats.size === 0) {
      this.hostSeat = null;
      if (!consented) {
        const graceMs = Math.min(LOBBY_REFRESH_GRACE_MS, loadGameData('stage2').coop!.disconnectSeconds * 1000);
        this.keepOpenUntil = Math.max(this.keepOpenUntil ?? 0, this.deps.now() + graceMs);
        this.deps.setAutoDispose(false);
      } else if (this.keepOpenUntil === null) this.deps.dispose();
      return;
    }
    if (this.hostSeat === entry.seat) this.hostSeat = Math.min(...this.seats.keys());
    this.broadcastLobby();
  }

  message(linkId: string, type: string, payload: unknown): void {
    const entry = this.links.get(linkId);
    if (!entry) return;
    // The new link has its snapshot (and so its new key) and is talking: the old key is done.
    if (this.prevKeys.get(entry.seat)?.linkId === linkId && !this.awaitingFull.has(linkId)) this.prevKeys.delete(entry.seat);
    if (type === 'ready' || type === 'start' || type === 'stage' || type === 'difficulty') {
      if (this.phase !== 'lobby') return this.notice(entry.link, { kind: 'roomError', reason: 'notInLobby' });
      if (type === 'ready') return this.onReady(entry.seat, payload);
      if (type === 'difficulty') return this.onDifficulty(entry.link, entry.seat, payload);
      if (type === 'stage') return this.onStage(entry.link, entry.seat, payload);
      return this.onStart(entry.link, entry.seat);
    }
    if (type === 'cmd') return this.onCommand(entry.seat, payload);
    if (type === 'watch') return this.onWatch(entry.link, entry.seat, payload);
    if (type === 'resync') {
      if (this.match) this.sendFull(entry.link, entry.seat);
      return;
    }
    if (type === 'rematch') this.onRematch(entry.link, entry.seat);
  }

  /** Server clock driver: runs every 50 ms tick that has come due (none are skipped), then closes the room after the result hold. */
  advance(): void {
    const now = this.deps.now();
    if (this.phase === 'lobby' && this.keepOpenUntil !== null && now >= this.keepOpenUntil) {
      this.keepOpenUntil = null;
      if (this.seats.size === 0) this.deps.dispose();
      else this.deps.setAutoDispose(true);
    }
    if (this.phase === 'playing') {
      while (this.phase === 'playing' && now - this.lastTickAt >= TICK_MS) {
        this.lastTickAt += TICK_MS;
        this.runTick();
      }
    }
    if (this.phase === 'result' && now - this.resultAt >= this.match!.data.coop!.resultSeconds * 1000) {
      this.phase = 'closed';
      this.deps.dispose();
    }
  }

  recording(): RecordedMatch {
    const match = this.match;
    if (!match) throw new Error('아직 시작하지 않은 판입니다.');
    if (this.deps.dev && this.options.devJumpTick !== undefined) throw new Error('라운드를 건너뛴 연습판입니다.');
    return structuredClone({ rulesRevision, dataVersion: match.dataVersion, stage: this.stage,
      seed: match.seed, seats: match.ring, options: match.options, log: this.log });
  }

  private onCommand(seat: number, payload: unknown): void {
    const match = this.match;
    if (this.phase !== 'playing' || !match) return;
    const parsed = parseClientCommand(payload, match.lanes[seat]?.slots.length);
    if (!parsed) return;
    let count = 0;
    for (const q of this.queue) if (q.seat === seat && q.seq > 0) count++;
    if (count >= match.data.coop!.maxCommandsPerTick) return;
    this.queue.push({ seat, seq: parsed.seq, cmd: parsed.cmd });
  }

  /** Rejoin by key (playing or result): swap the key, replace any old tab, and send a snapshot. */
  private rejoin(link: ClientLink, rejoinKey: unknown): void {
    if (this.phase !== 'playing' && this.phase !== 'result') throw new JoinError('badKey');
    let seat = 0;
    if (typeof rejoinKey === 'string') {
      for (const s of this.seats.keys()) if (this.keys[s] === rejoinKey || this.prevKeys.get(s)?.key === rejoinKey) { seat = s; break; }
    }
    if (seat === 0) throw new JoinError('badKey');

    // The tab keeps the key it came with until this link's first message after its full.
    this.prevKeys.set(seat, { key: rejoinKey as string, linkId: link.id });
    this.keys[seat] = this.deps.random128();
    let wasLinked = false;
    for (const [id, entry] of this.links) {
      if (entry.seat !== seat) continue;
      wasLinked = true;
      this.links.delete(id);
      this.awaitingFull.delete(id);
      this.notice(entry.link, { kind: 'replaced' });
      entry.link.close(4001);
    }
    this.links.set(link.id, { link, seat });
    this.seats.get(seat)!.linkId = link.id;
    if (this.phase === 'result') {
      this.sendFull(link, seat);
      this.notice(link, { kind: 'rematchReady', seats: [...this.rematchReady] });
      if (this.rematchReady.has(seat)) this.onRematch(link, seat);
      return;
    }
    if (!wasLinked) this.queue.push({ seat, seq: 0, cmd: { type: 'reconnect' } });
    // Inputs already received are stepped first; the snapshot follows at the end of the next tick.
    this.awaitingFull.add(link.id);
  }

  private onRematch(link: ClientLink, seat: number): void {
    if (this.phase !== 'result') return;
    if (!this.rematch) {
      const hostToken = this.deps.random128();
      // The new lobby outlives an early empty spell: everyone who presses within this room's hold is sent there.
      const keepOpenMs = this.match!.data.coop!.resultSeconds * 1000 - (this.deps.now() - this.resultAt);
      // a 20-round room asks exactly as before; a 70-round one carries its stage over
      const roomId = this.deps.createRematchRoom(this.stage === 'stage2' ? { hostToken, keepOpenMs } : { hostToken, keepOpenMs, stage: this.stage, difficulty: this.difficulty });
      this.rematch = { hostSeat: seat, hostToken, roomId };
      // A failed create lets the next press try again.
      roomId.catch(() => { if (this.rematch?.roomId === roomId) this.rematch = null; });
    }
    const { hostSeat, hostToken, roomId: pending } = this.rematch;
    pending.then(roomId => {
      if (this.phase !== 'result') return;
      if (this.links.get(link.id)?.link !== link) return;
      if (!this.rematchReady.has(seat)) {
        this.rematchReady.add(seat);
        const status: NoticeMsg = { kind: 'rematchReady', seats: [...this.rematchReady] };
        for (const { link: peer } of this.links.values()) this.notice(peer, status);
      }
      this.notice(link, seat === hostSeat ? { kind: 'rematch', roomId, hostToken } : { kind: 'rematch', roomId });
    }, () => {});
  }

  private onWatch(link: ClientLink, seat: number, payload: unknown): void {
    const match = this.match;
    if (this.phase !== 'playing' || !match || match.seats[seat]?.alive !== false) return;
    const target = (payload as { seat?: unknown } | null)?.seat;
    if (typeof target !== 'number' || !match.ring.includes(target) || !match.seats[target]!.alive) return;
    this.watching[seat] = target;
    this.sendFull(link, seat);
  }

  private runTick(): void {
    const match = this.match!;
    // 1. close this tick's queue and step
    const inputs = this.queue.splice(0);
    const step = stepMatch(match, inputs);
    if (inputs.length > 0) this.log.push({ tick: step.tick, inputs });

    // 2. per-seat updates go out right away
    const out = this.streamer!.afterStep(step);
    for (const { link, seat } of this.links.values()) {
      const mine = out.mine[seat];
      if (mine && !this.awaitingFull.has(link.id)) link.send('mine', mine);
    }

    for (const [seat, lane] of Object.entries(step.lanes)) {
      for (const event of lane.events) {
        const birth = birthOf(match.data, event);
        if (birth) {
          const firstSix = birth.grade === 6 && !this.sawSix;
          if (birth.grade === 6) this.sawSix = true;
          const msg: NoticeMsg = {
            kind: 'birth', seat: Number(seat), name: this.names[Number(seat)]!, defId: birth.defId, unitId: birth.unitId, via: birth.via, firstSix,
          };
          for (const peer of this.links.values()) this.notice(peer.link, msg);
          continue;
        }
        if (event.type !== 'gambleCoins' && event.type !== 'gambleUnit') continue;
        if (gambleTier(match.data, event) !== 'big') continue;
        const prize = event.type === 'gambleCoins' ? `×${event.multiplier}`
          : event.result === 'hidden' ? '숨은 유닛' : `${event.result}등급`;
        const name = this.names[Number(seat)]!;
        for (const peer of this.links.values()) {
          if (peer.seat !== Number(seat)) this.notice(peer.link, { kind: 'gamble', name, hit: `${prize} 당첨` });
        }
      }
    }

    // 3. lane events wait for the next update
    for (const seat of match.ring) this.pending.get(seat)!.push({ tick: step.tick, events: out.lanes[seat] ?? [] });

    // 4. spirits watching a fallen lane (or their own) move to the lowest living seat
    const needFull = new Set<number>();
    const alive = match.ring.filter(s => match.seats[s]!.alive);
    for (const seat of match.ring) {
      if (match.seats[seat]!.alive) continue;
      const w = this.watching[seat]!;
      if ((w === seat || !match.seats[w]?.alive) && alive.length > 0) {
        this.watching[seat] = alive[0]!;
        needFull.add(seat);
      }
    }

    // 5. every second tick, and on the tick the match ends: one numbered update to everyone
    if (step.tick % 2 === 1 || (match.result && this.phase === 'playing')) {
      this.n += 1;
      const tick = buildTick(match, this.names, this.n);
      for (const { link, seat } of this.links.values()) {
        if (this.awaitingFull.has(link.id)) continue;
        const w = this.watching[seat]!;
        link.send('tick', tick);
        link.send('lane', { n: this.n, seat: w, batches: this.pending.get(w) ?? [] });
      }
      for (const seat of match.ring) this.pending.set(seat, []);
    }

    // 6. snapshots for those whose lane changed and for rejoined links
    for (const [id, { link, seat }] of this.links) if (needFull.has(seat) || this.awaitingFull.has(id)) this.sendFull(link, seat);
    this.awaitingFull.clear();

    // 7. the result, once
    if (match.result && this.phase === 'playing') {
      this.phase = 'result';
      this.resultAt = this.deps.now();
      const msg: ResultMsg = { result: structuredClone(match.result) };
      for (const { link } of this.links.values()) link.send('result', msg);
      const minutes = Math.round(match.result.tick * TICK_MS / 60_000);
      this.deps.log?.(`[게임 끝] ${this.playLabel()} · ${OUTCOME_TEXT[match.result.outcome]} · ${match.result.round}라운드 · ${minutes}분`);
      // logging must never take the game server down: a record that cannot be built is dropped
      try { this.logRecord(minutes); } catch { /* dropped */ }
    }
  }

  private sendFull(link: ClientLink, seat: number): void {
    const match = this.match!;
    link.send('full', buildFull(match, seat, { watching: this.watching[seat] ?? seat, names: this.names, key: this.keys[seat]!, n: this.n }));
  }

  /**
   * A ready sent with the round count the player saw is taken only while that is still the room's choice: a press that
   * crosses the host's switch in flight must not mark the guest ready for a mode they never saw. A ready without
   * `stage` comes from the original 20-round lobby.
   */
  private onReady(seat: number, payload: unknown): void {
    const p = payload as { ready?: unknown; stage?: unknown; difficulty?: unknown } | null;
    const ready = p?.ready;
    if (typeof ready !== 'boolean') return;
    const s = this.seats.get(seat);
    if (!s) return;
    const shownStage = p?.stage === undefined ? 'stage2' : p.stage;
    if (ready && (shownStage !== this.stage || (this.stage === 'stage3' && (p?.difficulty ?? 'normal') !== this.difficulty))) {
      // tell the sender the current choice again; its button still says "준비"
      this.broadcastLobby();
      return;
    }
    if (s.ready === ready) return;
    s.ready = ready;
    this.broadcastLobby();
  }

  /**
   * Host only: switch the rule data. The new choice and every cleared ready go out in one lobby message, so no one
   * ever sees the new mode next to a ready given for the old one.
   */
  private onStage(link: ClientLink, seat: number, payload: unknown): void {
    if (seat !== this.hostSeat) return this.notice(link, { kind: 'roomError', reason: 'notHost' });
    const stage = (payload as { stage?: unknown } | null)?.stage;
    if (!isMatchStage(stage) || stage === this.stage) return;
    this.stage = stage;
    this.difficulty = stage === 'stage3' ? 'normal' : undefined;
    this.clearReadies();
  }

  private onDifficulty(link: ClientLink, seat: number, payload: unknown): void {
    if (seat !== this.hostSeat) return this.notice(link, { kind: 'roomError', reason: 'notHost' });
    const difficulty = (payload as { difficulty?: unknown } | null)?.difficulty;
    if (this.stage !== 'stage3' || !isDifficulty(difficulty)) {
      return this.notice(link, { kind: 'roomError', reason: 'badDifficulty' });
    }
    if (difficulty === this.difficulty) return;
    this.difficulty = difficulty;
    this.clearReadies();
  }

  private clearReadies(): void {
    for (const s of this.seats.values()) s.ready = false;
    this.broadcastLobby();
  }

  private onStart(link: ClientLink, seat: number): void {
    if (seat !== this.hostSeat) return this.notice(link, { kind: 'roomError', reason: 'notHost' });
    for (const s of this.seats.values()) if (s.seat !== this.hostSeat && !s.ready) return this.notice(link, { kind: 'roomError', reason: 'notReady' });
    this.start();
  }

  private start(): void {
    const { deps, options } = this;
    this.phase = 'playing';
    this.sawSix = false;
    const seed = deps.dev && options.seed !== undefined ? options.seed : deps.randomSeed();
    const ring = [...this.seats.keys()].sort((a, b) => a - b);
    // Only set the option when it is on, so a normal room hashes (and replays) like createMatch with default options.
    const matchOptions = deps.dev && options.devNoElimination === true ? { noElimination: true } : {};
    this.match = createMatch(loadGameData(this.stage), seed, ring, { ...matchOptions, difficulty: this.difficulty });
    if (deps.dev && options.devJumpTick !== undefined) jumpToTick(this.match, options.devJumpTick);
    deps.setAutoDispose(false);
    for (const seat of ring) {
      this.names[seat] = this.seats.get(seat)!.name;
      this.keys[seat] = deps.random128();
      this.watching[seat] = seat;
      this.pending.set(seat, []);
    }
    this.streamer = new MatchStreamer(this.match);
    this.lastTickAt = deps.now();
    for (const { link, seat } of this.links.values()) this.sendFull(link, seat);
    deps.log?.(`[게임 시작] ${this.playLabel()}`);
  }

  /** The replayable record and a summary for balance analysis; rounds skipped in a dev practice room are not real play. */
  private logRecord(minutes: number): void {
    const match = this.match!;
    const log = this.deps.log;
    if (!log || !match.result || this.options.devJumpTick !== undefined) return;
    const ids = (units: readonly ({ defId: string } | null)[] | undefined) => (units ?? []).flatMap(u => (u ? [u.defId] : []));
    const summary = {
      mode: 'online', stage: this.stage, difficulty: this.difficulty, players: match.ring.length,
      outcome: match.result.outcome, round: match.result.round, minutes, dataVersion: match.dataVersion, rulesRevision,
      seats: match.result.seats.map(s => ({
        seat: s.seat, outcome: s.outcome, round: s.round,
        board: ids(match.lanes[s.seat]?.slots), storage: ids(match.lanes[s.seat]?.storage),
      })),
    };
    playLogLines(randomUUID(), summary, this.recording()).then(lines => { for (const line of lines) log(line); }, () => {});
  }

  /** "4명 · 60라운드 보통" for the log lines. */
  private playLabel(): string {
    const mode = this.stage === 'stage3' ? `${this.match!.data.balance.rounds}라운드 ${DIFFICULTY_TEXT[this.difficulty ?? 'normal']}` : '20라운드';
    return `${this.match!.ring.length}명 · ${mode}`;
  }

  private notice(link: ClientLink, msg: NoticeMsg): void {
    link.send('notice', msg);
  }

  private broadcastLobby(): void {
    const seats = [...this.seats.values()].sort((a, b) => a.seat - b.seat).map(s => ({ seat: s.seat, name: s.name, ready: s.ready }));
    for (const { link, seat } of this.links.values()) {
      const msg: LobbyMsg = { roomId: this.roomId, you: seat, hostSeat: this.hostSeat, seats, stage: this.stage, ...(this.difficulty && { difficulty: this.difficulty }) };
      link.send('lobby', msg);
    }
  }
}
