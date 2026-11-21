import type { GameEvent, GameState, StoryEndReason } from '../types';
import { registerCommand } from '../registry';
import { addUnit, unitDefFast } from '../units';
import { pickResultSlot } from '../combine';
import { waveOf } from '../flow';
import { fitsCaps, nonQuestValue, questLoad, unitValue } from './ledger';

const recipeOf = (state: GameState, id: string) => state.data.recipes.find(r => r.result === id);

/**
 * For each material place of `target`'s recipe, the slot that fills it (unlocked units, pinned ids first,
 * then the lowest slot; one unit fills one place) and the places nobody fills.
 */
export function storySlots(state: GameState, target: string): { have: (number | null)[]; missing: number[] } {
  const materials = recipeOf(state, target)?.materials ?? [];
  const pinned = state.econ?.story.pinned ?? [];
  const used = new Set<number>();
  const have: (number | null)[] = [];
  const missing: number[] = [];
  materials.forEach((m, place) => {
    let pick: number | null = null;
    for (const id of pinned) {
      const i = state.slots.findIndex(u => u?.id === id);
      if (i >= 0 && !used.has(i) && state.slots[i]!.defId === m && !state.slots[i]!.locked) { pick = i; break; }
    }
    if (pick === null) {
      for (let i = 0; i < state.slots.length; i++) {
        const u = state.slots[i];
        if (u && !used.has(i) && u.defId === m && !u.locked) { pick = i; break; }
      }
    }
    if (pick === null) missing.push(place);
    else used.add(pick);
    have.push(pick);
  });
  return { have, missing };
}

function isStoryTarget(state: GameState, id: unknown): id is string {
  if (typeof id !== 'string') return false;
  const def = state.data.units.find(u => u.id === id);
  return !!def && def.grade === 6 && !def.hidden && !!recipeOf(state, id);
}

function endStory(state: GameState, reason: StoryEndReason, events: GameEvent[]): void {
  const story = state.econ!.story;
  if (!story.active) return;
  events.push({ type: 'storyEnd', target: story.active.target, reason });
  story.active = null;
}

registerCommand('storyTarget', (state, cmd, events) => {
  if (cmd.type !== 'storyTarget') return 'unknown';
  if (!state.econ || !state.data.economy?.story) return 'badTarget';
  if (cmd.id !== null && !isStoryTarget(state, cmd.id)) return 'badTarget';
  const story = state.econ.story;
  if (cmd.id !== story.target) {
    endStory(state, 'targetChanged', events);
    story.log = [];
    story.target = cmd.id;
  }
  story.pinned = cmd.id === null ? [] : [...(cmd.unitIds ?? [])];
  return null;
});

registerCommand('storyDecline', (state, _cmd, events) => {
  if (!state.econ?.story.active) return 'notOffered';
  endStory(state, 'declined', events);
  return null;
});

/** Value numbers of the request: total, held materials' value, support S, and the slots that would pay. */
function storyNumbers(state: GameState, target: string) {
  const { have, missing } = storySlots(state, target);
  const held = have.filter((x): x is number => x !== null);
  const total = unitValue(state.data, target);
  const paid = held.reduce((a, i) => a + unitValue(state.data, state.slots[i]!.defId), 0);
  const heldCost = held.reduce((a, i) => a + (state.slots[i]!.cost ?? 0), 0);
  return { have, missing, held, total, paid, support: total - paid, nAfter: nonQuestValue(state) - heldCost };
}

export function storyRoundStart(state: GameState, events: GameEvent[]): void {
  const def = state.data.economy?.story;
  const story = state.econ!.story;
  if (!def || !story.target || story.awarded || story.active || story.offers >= def.checks.length) return;
  const check = def.checks.find(c => c.round === state.round);
  if (!check) return;
  const target = story.target;
  let gap: number | null = null;
  for (const r of check.recordRounds) {
    let rec: (typeof story.log)[number] | undefined;
    for (let i = story.log.length - 1; i >= 0; i--) if (story.log[i]!.round === r) { rec = story.log[i]; break; }
    if (!rec || rec.target !== target || rec.missing === null) return;
    if (gap !== null && rec.missing !== gap) return;
    gap = rec.missing;
  }
  if (gap === null) return;
  const { missing } = storySlots(state, target);
  if (missing.length !== 1 || missing[0] !== gap) return;
  story.active = { target, missing: gap, round: state.round };
  story.offers++;
  events.push({ type: 'storyOffer', target, missing: recipeOf(state, target)!.materials[gap]!, round: state.round });
}

/** Ends the request as soon as its material picture changes. */
export function storyTick(state: GameState, events: GameEvent[]): void {
  const active = state.econ!.story.active;
  if (!active) return;
  const { missing } = storySlots(state, active.target);
  if (missing.length === 0) endStory(state, 'gotMaterial', events);
  else if (missing.length !== 1 || missing[0] !== active.missing) endStory(state, 'lostMaterial', events);
}

function settle(state: GameState, events: GameEvent[]): void {
  const def = state.data.economy!.story!;
  const econ = state.econ!;
  const active = econ.story.active!;
  const n = storyNumbers(state, active.target);
  if (n.missing.length === 0) return endStory(state, 'gotMaterial', events);
  if (n.missing.length !== 1 || n.missing[0] !== active.missing) return endStory(state, 'lostMaterial', events);
  if (econ.roundKills < def.kills) return endStory(state, 'kills', events);
  if (state.coins < def.fee.coins || state.buckwheat < def.fee.buckwheat) return endStory(state, 'funds', events);
  if (!fitsCaps(state, n.support, 0, n.nAfter)) return endStory(state, 'cap', events);
  const resultSlot = pickResultSlot(state, [...n.held].sort((a, b) => a - b));
  for (const i of n.held) state.slots[i] = null;
  state.coins -= def.fee.coins;
  state.buckwheat -= def.fee.buckwheat;
  const unit = addUnit(state, active.target, resultSlot, events);
  unit.cost = 0;
  econ.ledger.story += n.support;
  econ.story.awarded = true;
  events.push({ type: 'summon', unitId: unit.id, defId: unit.defId, grade: unitDefFast(state.data, unit.defId).grade, slot: resultSlot });
  events.push({ type: 'questReward', quest: 'story', coins: 0, buckwheat: 0, tokens: 0 });
  endStory(state, 'award', events);
}

/** Records the round's gap and settles a request opened this round. */
export function storyRoundEnd(state: GameState, events: GameEvent[]): void {
  const def = state.data.economy?.story;
  const econ = state.econ!;
  if (!def) return;
  if (econ.story.active && econ.story.active.round === state.round) settle(state, events);
  const target = econ.story.target;
  if (target && waveOf(state, state.round).type === 'normal') {
    const { missing } = storySlots(state, target);
    econ.story.log.push({ round: state.round, target, missing: missing.length === 1 ? missing[0]! : null });
  }
}

export interface StoryView {
  target: string; have: boolean[]; kills: number; need: number; total: number; paid: number; support: number;
  used: number; cap: number; short: number;
}

export function storyView(state: GameState): StoryView | null {
  const def = state.data.economy;
  const econ = state.econ;
  const target = econ?.story.target;
  if (!def?.story || !econ || !target) return null;
  const n = storyNumbers(state, target);
  const q = questLoad(state);
  return {
    target, have: n.have.map(x => x !== null), kills: econ.roundKills, need: def.story.kills,
    total: n.total, paid: n.paid, support: n.support, used: q, cap: def.ledger.totalCap,
    short: Math.max(0, def.ledger.ratio * (q + n.support) - n.nAfter),
  };
}
