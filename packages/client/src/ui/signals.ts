import { NOTICE_SPAN, type WinPlace } from '../layout';
import type { BirthBanner } from './birth';
import type { Sides } from './windows';

export type SlotKind = 'countdown' | 'birth' | 'banner' | 'fallen' | 'note';
/** `color`: a board toast keeps its own colour (a grade's star, the gamble yellow). */
export interface SlotItem { kind: Exclude<SlotKind, 'countdown'>; text: string; ms: number; say?: string; tail?: string; birth?: BirthBanner; color?: number }
export interface SlotShown { kind: SlotKind; item: SlotItem | null; start: number; until: number }

export const SLOT_RANK: Record<SlotKind, number> = { countdown: 1, birth: 2, banner: 3, fallen: 4, note: 5 };
export const NOTE_WAIT_MS = 3000, BANNER_LATE_MS = 1200, BIRTH_WAITING_MAX = 4;

interface Waiting { item: SlotItem; pushedAt: number; waited: boolean; restored: boolean }

export class TopSlot {
  private queue: Waiting[] = [];
  private shown: (SlotShown & { from: Waiting | null }) | null = null;

  push(item: SlotItem, now: number): void {
    const busy = this.shown !== null && now < this.shown.until;
    this.queue.push({ item, pushedAt: now, waited: busy, restored: false });
    if (item.kind === 'birth') {
      const births = this.queue.filter(w => w.item.kind === 'birth');
      if (births.length > BIRTH_WAITING_MAX) this.queue.splice(this.queue.indexOf(births[0]!), 1);
    }
  }

  /** countdown=true holds the slot; the item it pushed off goes back to wait (a note is dropped) */
  current(now: number, countdown: boolean): SlotShown | null {
    this.queue = this.queue.filter(w => w.item.kind !== 'note' || now - w.pushedAt <= NOTE_WAIT_MS);
    if (countdown) {
      if (this.shown?.kind !== 'countdown') {
        const off = this.shown?.from;
        if (off && now < this.shown!.until && off.item.kind !== 'note') this.queue.unshift({ ...off, waited: false, restored: true });
        this.shown = { kind: 'countdown', item: null, start: now, until: Number.POSITIVE_INFINITY, from: null };
      }
    } else {
      if (this.shown && (this.shown.kind === 'countdown' || now >= this.shown.until)) this.shown = null;
      if (!this.shown) this.shown = this.next(now);
    }
    if (this.shown) for (const w of this.queue) w.waited = true;
    return this.shown && { kind: this.shown.kind, item: this.shown.item, start: this.shown.start, until: this.shown.until };
  }

  clear(): void {
    this.queue = [];
    this.shown = null;
  }

  private next(now: number): (SlotShown & { from: Waiting }) | null {
    let best: Waiting | null = null;
    for (const w of this.queue) if (!best || SLOT_RANK[w.item.kind] < SLOT_RANK[best.item.kind]) best = w;
    if (!best) return null;
    this.queue.splice(this.queue.indexOf(best), 1);
    const late = best.item.kind === 'banner' && best.waited && !best.restored;
    return { kind: best.item.kind, item: best.item, start: now, until: now + (late ? BANNER_LATE_MS : best.item.ms), from: best };
  }
}

export function slotSpan(narrow: boolean): { x: number; w: number } {
  return narrow ? { x: NOTICE_SPAN.x, w: NOTICE_SPAN.w } : { x: 128, w: 400 };
}

export type RefusalSpot = { at: 'button'; selector: string } | { at: 'win'; side: 'left' | 'right'; selector: string } | { at: 'slot' };

function refusalButtons(command: { type: string; arg?: string }): { button?: string; win?: { side: 'left' | 'right'; selector: string } } {
  switch (command.type) {
    case 'summon': return { button: '#right [data-action="summon"]', win: { side: 'right', selector: '#win-right .win-summon' } };
    case 'convertToken': return { button: '#right [data-action="convert"]' };
    case 'upgrade': return command.arg === undefined ? {} : { win: { side: 'right', selector: `#win-right [data-action="upgrade"][data-arg="${command.arg}"]` } };
    case 'sell': return { button: '#bottom [data-action="sell"]', win: { side: 'left', selector: '#win-left [data-action="sell"]' } };
    case 'combine': {
      // the row pressed, or the keyed row Z/X/C named; a redraw that took it away or shut it leaves the slot
      if (command.arg === undefined) return {};
      const row = (box: string) => `${box} [data-action="combine"][data-arg="${command.arg}"]:not(:disabled)`;
      const stored = `#stage [data-action="storageCombine"][data-arg="${command.arg}"]:not(:disabled)`;
      return { button: `${row('#stage')}, ${stored}`, win: { side: 'left', selector: row('#win-left') } };
    }
    case 'buyItem': return command.arg === undefined ? {} : { win: { side: 'right', selector: `#win-right [data-action="buyItem"][data-arg="${command.arg}"]` } };
    // the list closes on the press, so the refusal lands on the button that opened it (solo 붙이기 ▾, online 아이템 ▾)
    case 'attachItem': {
      if (command.arg === undefined) return {};
      const unitId = command.arg.split('@')[1] ?? '';
      return { button: `#left [data-action="itemMenu"][data-arg="${unitId}"], #bottom [data-action="itemMenu"][data-arg="${unitId}"]` };
    }
    default: return {};
  }
}

export function refusalSpot(command: { type: string; arg?: string }, visible: (selector: string) => boolean): RefusalSpot {
  const { button, win } = refusalButtons(command);
  if (button && visible(button)) return { at: 'button', selector: button };
  if (win && visible(win.selector)) return { at: 'win', side: win.side, selector: win.selector };
  return { at: 'slot' };
}

const REFUSAL_RISE = 20, REFUSAL_MARGIN = 2;

/** The box (16 px) plus its 4 px tail ends on the button's top edge. */
export function refusalPos(button: { left: number; top: number; width: number }, box: { w: number }, containerW: number): { left: number; top: number } {
  const centered = Math.round(button.left + button.width / 2 - box.w / 2);
  const left = Math.max(REFUSAL_MARGIN, Math.min(centered, containerW - REFUSAL_MARGIN - box.w));
  return { left, top: button.top - REFUSAL_RISE };
}

export function coinSpot(wins: WinPlace, sides: Sides): 'right' | 'win' | 'slot' {
  if (wins !== 'inside' || sides.right === null) return 'right';
  return sides.right === 'market' ? 'win' : 'slot';
}

export type LoopOwner = 'countdown' | 'jangseung' | 'edge' | 'triangle';

export function loopOwner(o: { countdownPulse: boolean; over: boolean; danger: boolean }): LoopOwner {
  if (o.countdownPulse) return 'countdown';
  if (o.over) return 'jangseung';
  if (o.danger) return 'edge';
  return 'triangle';
}

const ONE_SHOTS_MAX = 2;

export class OneShots {
  private ends: number[] = [];

  /** false means too many are running: show the end state at once */
  begin(now: number, ms: number): boolean {
    this.ends = this.ends.filter(end => end > now);
    if (this.ends.length >= ONE_SHOTS_MAX) return false;
    this.ends.push(now + ms);
    return true;
  }
}

export type EndKind = 'gate' | 'wipe' | 'clear' | 'soloDefeat' | 'soloClear';

export function endSceneText(kind: EndKind, stageName?: string): string {
  switch (kind) {
    case 'gate': return stageName ? `관문 실패 · 역신(${stageName})을 막지 못했습니다` : '관문 실패 · 역신을 막지 못했습니다';
    case 'wipe': return '모두 쓰러졌습니다';
    case 'soloDefeat': return '장승이 쓰러졌습니다';
    case 'clear':
    case 'soloClear': return '고개를 지켜 냈습니다';
  }
}

export const END_SCENE_MS = 1500, END_SCENE_SUB = '곧 결과 화면 · 누르면 바로';

export class EndScene {
  private shown: { kind: EndKind; text: string; until: number } | null = null;
  private skipped = false;

  start(kind: EndKind, text: string, now: number): void {
    this.shown = { kind, text, until: now + END_SCENE_MS };
    this.skipped = false;
  }

  active(now: number): boolean {
    return this.shown !== null && !this.skipped && now < this.shown.until;
  }

  skip(): void { this.skipped = true; }

  get kind(): EndKind | null { return this.shown?.kind ?? null; }

  get text(): string | null { return this.shown?.text ?? null; }
}
