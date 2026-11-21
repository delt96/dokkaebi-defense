import {
  chooseSlot, createGame, laneOf, loopPos, step, unitDefFast,
  type BossControlDef, type Command, type GameData,
} from '@dorandi/logic';
import { forceRound, placeUnitForTest } from '@dorandi/logic/testing';
import { followBoss } from '../bots';

const FAN3 = ['buchae', 'buchae', 'buchae'];
const SAW2POT = ['top', 'top', 'gamasot'];
export const CONTROL_LINEUPS: Record<string, string[]> = {
  fan3: FAN3,
  'fan3+gimseobang': [...FAN3, 'gimseobang'],
  'fan3+jocheong': [...FAN3, 'cheonnyeonjocheongdanji'],
  saw2pot: SAW2POT,
  'saw2pot+gimseobang': [...SAW2POT, 'gimseobang'],
  'saw2pot+jocheong': [...SAW2POT, 'cheonnyeonjocheongdanji'],
};

/** `none` keeps the log with caps too large to bite. */
export const CONTROL_CAPS = {
  none: { windowTicks: 200, stunTicks: 1e9, pushDistance: 1e9, maxStoppedShare: 1 },
  cap3: { windowTicks: 200, stunTicks: 60, pushDistance: 3, maxStoppedShare: 0.3 },
  cap4: { windowTicks: 200, stunTicks: 80, pushDistance: 4, maxStoppedShare: 0.3 },
} as const satisfies Record<string, BossControlDef>;
export type ControlCap = keyof typeof CONTROL_CAPS;
export type ControlBoss = 'jinegaksi' | 'gangcheori';

export interface ControlRow {
  lineup: string; boss: ControlBoss; cap: ControlCap; seed: number;
  aliveTicks: number; stoppedTicks: number; stoppedShare: number; maxWindowStopped: number;
  stunClipped: number; pushApplied: number; pushClipped: number; entranceClipped: number;
  netAdvance: number; maxDwellTicks: number; pass: boolean | null;
}

const FOLLOW_EVERY = 40;
const MAX_STOPPED_SHARE = 0.3;

/** One unkillable lane boss against a control lineup for its whole boss round. */
export function controlTrial(data: GameData, t: { lineup: string; boss: ControlBoss; cap: ControlCap; seed: number }): ControlRow {
  const d = structuredClone(data);
  d.balance.bossControl = { ...CONTROL_CAPS[t.cap] };
  const bossDef = d.enemies.find(e => e.id === t.boss);
  if (!bossDef) throw new Error(`unknown boss ${t.boss}`);
  bossDef.hp = 1e12;
  const lineup = CONTROL_LINEUPS[t.lineup];
  if (!lineup) throw new Error(`unknown lineup ${t.lineup}`);

  const state = createGame(d, t.seed);
  state.open = state.open.map(() => true);
  for (const id of lineup) {
    const slot = chooseSlot(state, unitDefFast(d, id));
    if (slot === null) throw new Error(`no slot for ${id}`);
    placeUnitForTest(state, id, slot);
  }
  forceRound(state, t.boss === 'jinegaksi' ? 10 : 20);
  const perimeter = laneOf(state).perimeter;
  let cell = -1;
  let dwell = 0;
  let maxDwell = 0;
  while (state.tick < state.roundEndTick - 1 && state.phase !== 'ended') {
    const cmds: Command[] = state.tick % FOLLOW_EVERY === 0 ? followBoss(state) : [];
    step(state, cmds);
    const boss = state.enemies.find(e => e.boss);
    if (!boss) continue;
    const c = Math.floor(loopPos(boss.d, perimeter));
    dwell = c === cell ? dwell + 1 : 1;
    cell = c;
    maxDwell = Math.max(maxDwell, dwell);
  }
  const boss = state.enemies.find(e => e.boss);
  const ctl = boss?.ctl;
  if (!boss || !ctl) throw new Error('boss or its control log is missing');
  const stoppedShare = ctl.alive ? ctl.stopped / ctl.alive : 0;
  return {
    lineup: t.lineup, boss: t.boss, cap: t.cap, seed: t.seed,
    aliveTicks: ctl.alive, stoppedTicks: ctl.stopped, stoppedShare, maxWindowStopped: ctl.maxWindowStopped,
    stunClipped: ctl.stunClipped, pushApplied: ctl.pushApplied, pushClipped: ctl.pushClipped, entranceClipped: ctl.entranceClipped,
    netAdvance: boss.d, maxDwellTicks: maxDwell,
    pass: t.cap === 'none' ? null : stoppedShare <= MAX_STOPPED_SHARE + 1e-12 && ctl.maxWindowStopped <= CONTROL_CAPS[t.cap].stunTicks,
  };
}

export function controlAll(data: GameData, seeds: number): ControlRow[] {
  const rows: ControlRow[] = [];
  for (const lineup of Object.keys(CONTROL_LINEUPS)) {
    for (const boss of ['jinegaksi', 'gangcheori'] as const) {
      for (const cap of Object.keys(CONTROL_CAPS) as ControlCap[]) {
        for (let seed = 1; seed <= seeds; seed++) rows.push(controlTrial(data, { lineup, boss, cap, seed }));
      }
    }
  }
  return rows;
}
