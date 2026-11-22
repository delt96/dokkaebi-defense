export type SfxName = 'summon1' | 'summon2' | 'summon3' | 'combine' | 'hit' | 'kill' | 'bossKill' | 'defeat' | 'clear'
  | 'gambleSmall' | 'gambleBig' | 'gambleLose';

const GAMBLE_NOTES = {
  gambleLose: [175],
  gambleSmall: [660, 880],
  gambleBig: [523, 659, 784, 1047],
};
let context: AudioContext | undefined;

/** Unlock Web Audio on the press so the chime can start when the result is shown. */
export function primeGambleSfx(): void {
  if (typeof AudioContext !== 'function') return;
  context ??= new AudioContext();
  if (context.state === 'suspended') void context.resume().catch(() => undefined);
}

export function playSfx(name: SfxName, reduced = false): void {
  if (!context || context.state !== 'running' || !(name in GAMBLE_NOTES)) return;
  const audio = context;
  const notes = GAMBLE_NOTES[name as keyof typeof GAMBLE_NOTES];
  const volume = reduced ? 0.022 : name === 'gambleLose' ? 0.028 : 0.085;
  for (const [i, hz] of (reduced ? notes.slice(-1) : notes).entries()) {
    const start = audio.currentTime + i * 0.07;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = name === 'gambleBig' ? 'triangle' : 'sine';
    oscillator.frequency.value = hz;
    gain.gain.setValueAtTime(0.001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.15);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.16);
  }
}
