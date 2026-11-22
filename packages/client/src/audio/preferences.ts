import { isTrackId, type TrackId } from './music';

export interface AudioSettings {
  effects: number;
  music: number;
  muted: boolean;
  normal: TrackId;
  boss: TrackId;
}

export const DEFAULT_AUDIO: Readonly<AudioSettings> = { effects: 70, music: 40, muted: false, normal: 84, boss: 197 };
const STORAGE_KEY = 'dorandi.audio';

function volume(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : fallback;
}

export function readAudioSettings(storage?: Pick<Storage, 'getItem'>): AudioSettings {
  try {
    const data: Partial<AudioSettings> | null = JSON.parse((storage ?? globalThis.localStorage)?.getItem(STORAGE_KEY) ?? 'null');
    return {
      effects: volume(data?.effects, DEFAULT_AUDIO.effects),
      music: volume(data?.music, DEFAULT_AUDIO.music),
      muted: data?.muted === true,
      normal: isTrackId(data?.normal) ? data.normal : DEFAULT_AUDIO.normal,
      boss: isTrackId(data?.boss) ? data.boss : DEFAULT_AUDIO.boss,
    };
  } catch { return { ...DEFAULT_AUDIO }; }
}

export function writeAudioSettings(settings: AudioSettings, storage?: Pick<Storage, 'setItem'>): void {
  try { (storage ?? globalThis.localStorage)?.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* current page still uses the settings */ }
}
