import { unitDefFast, type BirthVia, type GameData } from '@dorandi/logic';

export const BIRTH_MS = 2500;
const MAX_WAITING = 4;
const GOLD = 0xffe35a;
const VIOLET = 0xc48cff;

export interface BirthAlert { seat?: number; name?: string; defId: string; unitId: number; via: BirthVia; firstSix: boolean }
export interface BirthBanner { who: string; title: string; sub: string; color: number; defId: string; mine: boolean }

const OWN: Record<BirthVia, string> = { combine: '조합', tame: '길들이기 성공', gamble: '도박 당첨' };
const PEER: Record<BirthVia, string> = { combine: '만들었습니다', tame: '길들였습니다', gamble: '도박에서 뽑았습니다' };

export function birthBanner(data: GameData, alert: BirthAlert, opts: { mine: boolean; team: boolean }): BirthBanner {
  const def = unitDefFast(data, alert.defId);
  const who = opts.mine ? OWN[alert.via] : `${alert.seat} ${alert.name} 님이 ${PEER[alert.via]}`;
  const parts = [`${def.hidden ? '히든 ' : ''}${def.grade}등급`, def.damageType === 'physical' ? '물딜' : '마딜'];
  if (alert.firstSix) parts.push(`이번 판 ${opts.team ? '팀 ' : ''}첫 6등급`);
  return { who, title: def.name, sub: parts.join(' · '), color: def.hidden ? VIOLET : GOLD, defId: alert.defId, mine: opts.mine };
}

export class BirthQueue {
  private shown: { banner: BirthBanner; start: number } | null = null;
  private waiting: BirthBanner[] = [];

  push(b: BirthBanner): void {
    this.waiting.push(b);
    // with nothing on screen the head of the list is the next one shown, not one waiting
    const cap = this.shown ? MAX_WAITING : MAX_WAITING + 1;
    if (this.waiting.length > cap) this.waiting.splice(this.shown ? 0 : 1, 1);
  }

  current(now: number): { banner: BirthBanner; start: number } | null {
    if (this.shown && now - this.shown.start >= BIRTH_MS) this.shown = null;
    if (!this.shown) {
      const next = this.waiting.shift();
      if (next) this.shown = { banner: next, start: now };
    }
    return this.shown;
  }

  clear(): void {
    this.shown = null;
    this.waiting = [];
  }
}

/** My own gamble prize: the banner waits for the dice to stop, whichever of the notice and the reveal comes first. */
export class BirthHold {
  private held = new Map<number, BirthAlert>();
  private revealed = new Set<number>();

  hold(alert: BirthAlert): BirthAlert | null {
    if (this.revealed.delete(alert.unitId)) return alert;
    this.held.set(alert.unitId, alert);
    return null;
  }

  reveal(unitId: number): BirthAlert | null {
    const alert = this.held.get(unitId);
    if (alert) {
      this.held.delete(unitId);
      return alert;
    }
    this.revealed.add(unitId);
    return null;
  }

  clear(): void {
    this.held.clear();
    this.revealed.clear();
  }
}

export class FirstSix {
  private seen = false;

  take(grade: number): boolean {
    if (grade !== 6 || this.seen) return false;
    this.seen = true;
    return true;
  }

  reset(): void {
    this.seen = false;
  }
}
