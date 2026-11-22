import type { Command, GameEvent } from '@dorandi/logic';

interface Effect {
  file: string;
  volume: number;
  interval?: number;
  pitch?: number;
}

export const EFFECTS = {
  swish: { file: 'swish.wav', volume: 0.25 },
  sparkle: { file: 'sparkle.ogg', volume: 0.85 },
  combine: { file: 'combine.ogg', volume: 0.30 },
  combineBig: { file: 'combine-big.ogg', volume: 0.62 },
  kill: { file: 'thud.ogg', volume: 0.10, interval: 1000 / 6, pitch: 0.05 },
  heavyHit: { file: 'heavy-hit.ogg', volume: 0.09, interval: 250, pitch: 0.05 },
  bossDown: { file: 'boss-down.ogg', volume: 0.36, interval: 450 },
  gong: { file: 'gong.ogg', volume: 0.40, interval: 450 },
  round: { file: 'round.ogg', volume: 0.19 },
  upgrade: { file: 'upgrade.ogg', volume: 0.27 },
  sell: { file: 'sell.ogg', volume: 0.28 },
  reward: { file: 'reward.ogg', volume: 0.32, interval: 130 },
  pack: { file: 'pack.ogg', volume: 0.30 },
  dice: { file: 'dice.ogg', volume: 0.23 },
  chips: { file: 'chips.ogg', volume: 0.28 },
  gambleSmall: { file: 'reward.ogg', volume: 0.36 },
  gambleBig: { file: 'jackpot.ogg', volume: 0.43 },
  gambleLose: { file: 'lose.ogg', volume: 0.24 },
  huntRoar: { file: 'roar.ogg', volume: 0.34 },
  huntFlee: { file: 'flee.ogg', volume: 0.26 },
  click: { file: 'click.ogg', volume: 0.13, interval: 55 },
  error: { file: 'error.ogg', volume: 0.18, interval: 200 },
  clear: { file: 'clear.ogg', volume: 0.53 },
  defeat: { file: 'defeat.ogg', volume: 0.48 },
} as const satisfies Record<string, Effect>;

export type Sound = keyof typeof EFFECTS;
export const effect = (sound: Sound): Effect => EFFECTS[sound];

const NONE: readonly Sound[] = [];

function summonSounds(grade: number): readonly Sound[] {
  return grade >= 3 ? ['swish', 'sparkle'] : ['swish'];
}

export function gambleSounds(tier: 'small' | 'big' | 'lose', grade?: number): readonly Sound[] {
  if (tier === 'lose') return ['gambleLose'];
  return [...(grade ? summonSounds(grade) : NONE), tier === 'big' || (grade ?? 0) >= 5 ? 'gambleBig' : 'gambleSmall'];
}

export function eventSounds(
  event: GameEvent, { mine = true, grade = 0, boss = false, hunt = false } = {},
): readonly Sound[] {
  if (event.type === 'roundStart') return ['round'];
  if (event.type === 'ended') return [event.result.outcome === 'clear' ? 'clear' : 'defeat'];
  // a boss is everyone's moment, so it is heard on a watched lane as well
  if (boss && event.type === 'spawn') return ['gong'];
  if (boss && event.type === 'kill') return ['bossDown'];
  if (!mine) return NONE;
  switch (event.type) {
    case 'summon': return summonSounds(event.grade);
    case 'combine': return [grade >= 5 ? 'combineBig' : 'combine'];
    case 'spawn': return hunt ? ['huntRoar'] : NONE;
    case 'kill': return ['kill'];
    case 'attack': return grade >= 5 ? ['heavyHit'] : NONE;
    case 'questReward': return event.coins || event.buckwheat ? ['reward'] : NONE;
    case 'hunt': return [event.outcome === 'won' ? 'reward' : 'huntFlee'];
    default: return NONE;
  }
}

/** Online only: the shared 역신 as the match view shows it (its stage while on the field, and the team's kills). */
export interface SharedField { yeoksin: number | null; kills: number }

export function sharedSounds(prev: SharedField | undefined, next: SharedField): readonly Sound[] {
  if (!prev) return NONE;
  const out: Sound[] = [];
  if (next.yeoksin !== null && next.yeoksin !== prev.yeoksin) out.push('gong');
  if (next.kills > prev.kills) out.push('bossDown');
  return out;
}

export function commandSound(type: Command['type']): Sound | undefined {
  if (type === 'upgrade') return 'upgrade';
  if (type === 'sell' || type === 'sellStored') return 'sell';
}

export function throttle() {
  const last = new Map<Sound, number>();
  return (sound: Sound, now: number): boolean => {
    const interval = effect(sound).interval;
    if (interval === undefined) return true;
    if (now - (last.get(sound) ?? -Infinity) < interval) return false;
    last.set(sound, now);
    return true;
  };
}
