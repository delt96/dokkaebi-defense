import { gambleSounds } from './audio/cues';
import { gameAudio } from './audio/engine';

export function playGamblePress(type: 'gambleUnit' | 'gambleCoins'): void {
  gameAudio.play(type === 'gambleUnit' ? 'pack' : 'chips');
}

export function playGambleResult(tier: 'small' | 'big' | 'lose', grade?: number): void {
  for (const sound of gambleSounds(tier, grade)) gameAudio.play(sound);
}
