import type { AudioSettings } from './preferences';

const track = <T extends number>(id: T, name: string, sourceId: number) => ({
  id, name, file: `gugak-${id}.mp3`,
  source: `https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?wrtSn=${sourceId}&menuNo=200020`,
});

export const TRACKS = [
  track(6, '평화로운 마을', 13386746),
  track(139, '차분한 마을', 13386879),
  track(84, '신비로운', 13386824),
  track(197, '사물놀이', 13386937),
  track(244, '배틀하는', 13386984),
  track(60, '결전 직전', 13386800),
] as const;

export type TrackId = typeof TRACKS[number]['id'];
export type MusicMode = 'normal' | 'boss' | null;
export const MUSIC_AUTHOR = '주식회사 아이티앤';
export const MUSIC_LICENSE = 'https://creativecommons.org/licenses/by/4.0/';

export function isTrackId(id: unknown): id is TrackId {
  return TRACKS.some(track => track.id === id);
}

/** Boss music through a boss round and for as long as a 역신 is anywhere on the field; none after the end. */
export function musicMode({ phase, bossRound, yeoksin }: {
  phase: 'prep' | 'round' | 'ended'; bossRound: boolean; yeoksin: boolean;
}): MusicMode {
  if (phase === 'ended') return null;
  return (phase === 'round' && bossRound) || yeoksin ? 'boss' : 'normal';
}

export function trackFor(mode: MusicMode, settings: AudioSettings, preview?: TrackId): TrackId | null {
  return mode === null ? null : preview ?? settings[mode];
}
