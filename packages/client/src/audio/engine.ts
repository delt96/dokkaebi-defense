import { effect, throttle, type Sound } from './cues';
import { TRACKS, trackFor, type MusicMode, type TrackId } from './music';
import { readAudioSettings, writeAudioSettings, type AudioSettings } from './preferences';

const FADE_SECONDS = 1;
const MUSIC_CACHE_SIZE = 2;

interface PlayingTrack {
  id: TrackId;
  source: AudioBufferSourceNode;
  gain: GainNode;
  started: number;
}

/** One audio mixer per page. The browser's first input unlocks it. */
class GameAudio {
  settings = readAudioSettings();
  private context?: AudioContext;
  private effectsGain?: GainNode;
  private musicGain?: GainNode;
  private resuming?: Promise<void>;
  private readonly effects = new Map<string, Promise<AudioBuffer | null>>();
  private readonly music = new Map<string, Promise<AudioBuffer | null>>();
  private readonly allow = throttle();
  private mode: MusicMode = null;
  private preview?: TrackId;
  private requested: TrackId | null = null;
  private requestNumber = 0;
  private playing?: PlayingTrack;

  unlock(): void {
    try {
      if (!this.context) {
        const context = new AudioContext();
        this.effectsGain = context.createGain();
        this.musicGain = context.createGain();
        this.effectsGain.connect(context.destination);
        this.musicGain.connect(context.destination);
        this.context = context;
        this.mix();
      }
      if (this.context.state === 'running') {
        this.refreshMusic();
        return;
      }
      if (!this.resuming) {
        this.resuming = this.context.resume().then(() => this.refreshMusic()).catch(() => undefined)
          .finally(() => { this.resuming = undefined; });
      }
    } catch { /* audio is optional */ }
  }

  configure(patch: Partial<AudioSettings>): void {
    this.settings = { ...this.settings, ...patch };
    writeAudioSettings(this.settings);
    this.mix();
    this.refreshMusic();
  }

  musicMode(mode: MusicMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.refreshMusic();
  }

  previewTrack(track?: TrackId): void {
    this.preview = track;
    this.refreshMusic();
  }

  play(sound: Sound): void {
    const context = this.context;
    const bus = this.effectsGain;
    if (!context || !bus || this.settings.muted || !this.settings.effects) return;
    const cue = effect(sound);
    const at = performance.now();
    void (this.resuming ?? Promise.resolve()).then(async () => {
      if (context.state !== 'running' || this.settings.muted || !this.settings.effects) return;
      const buffer = await this.load(context, `sfx/${cue.file}`, this.effects);
      const now = performance.now();
      if (!buffer || this.settings.muted || !this.settings.effects || now - at > (cue.interval ? 450 : 1800) || !this.allow(sound, now)) return;
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = buffer;
      source.playbackRate.value = 1 + (cue.pitch ?? 0) * (2 * Math.random() - 1);
      gain.gain.value = cue.volume;
      source.connect(gain).connect(bus);
      source.onended = () => { source.disconnect(); gain.disconnect(); };
      source.start();
    }).catch(() => undefined);
  }

  private mix(): void {
    const context = this.context;
    if (!context || !this.effectsGain || !this.musicGain) return;
    const { muted, effects, music } = this.settings;
    this.effectsGain.gain.setTargetAtTime(muted ? 0 : effects / 100, context.currentTime, 0.015);
    this.musicGain.gain.setTargetAtTime(muted ? 0 : music / 100, context.currentTime, 0.015);
  }

  private load(context: AudioContext, path: string, cache: Map<string, Promise<AudioBuffer | null>>, max = Infinity): Promise<AudioBuffer | null> {
    const existing = cache.get(path);
    if (existing) {
      cache.delete(path);
      cache.set(path, existing);
      return existing;
    }
    const url = `${import.meta.env.BASE_URL}${path}`;
    const pending = fetch(url).then(response => {
      if (!response.ok) throw new Error('Audio request failed');
      return response.arrayBuffer();
    }).then(bytes => context.decodeAudioData(bytes)).catch(() => null);
    cache.set(path, pending);
    if (cache.size > max) cache.delete(cache.keys().next().value!);
    return pending;
  }

  private refreshMusic(): void {
    const context = this.context;
    const bus = this.musicGain;
    if (!context || !bus || context.state !== 'running') return;
    const wanted = trackFor(this.mode, this.settings, this.preview);
    // Let an active track keep its place if the listener turns the music down.
    const target = this.settings.muted || !this.settings.music ? (wanted === null ? null : this.playing?.id ?? null) : wanted;
    if (target === this.requested) return;
    this.requested = target;
    const request = ++this.requestNumber;
    if (target === null) {
      this.stopTrack(context);
      return;
    }
    if (target === this.playing?.id) return;
    const file = TRACKS.find(track => track.id === target)!.file;
    void this.load(context, `bgm/${file}`, this.music, MUSIC_CACHE_SIZE).then(buffer => {
      if (!buffer || request !== this.requestNumber) return;
      const now = context.currentTime;
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = buffer;
      source.loop = true;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(1, now + FADE_SECONDS);
      source.connect(gain).connect(bus);
      source.onended = () => { source.disconnect(); gain.disconnect(); };
      source.start(now);
      this.stopTrack(context);
      this.playing = { id: target, source, gain, started: now };
    }).catch(() => undefined);
  }

  private stopTrack(context: AudioContext): void {
    const previous = this.playing;
    if (!previous) return;
    this.playing = undefined;
    const now = context.currentTime;
    previous.gain.gain.cancelScheduledValues(now);
    previous.gain.gain.setValueAtTime(Math.min(1, (now - previous.started) / FADE_SECONDS), now);
    previous.gain.gain.linearRampToValueAtTime(0, now + FADE_SECONDS);
    previous.source.stop(now + FADE_SECONDS);
  }
}

export const gameAudio = new GameAudio();

export function installAudioInput(): void {
  const unlock = () => gameAudio.unlock();
  const click = (event: MouseEvent | PointerEvent) => {
    unlock();
    const control = (event.target as HTMLElement).closest?.('button:not(:disabled), a.entry-link, a.big, a.entry-home');
    if (control) gameAudio.play('click');
  };
  // Capture before the UI redraws the button. Pointerup also unlocks touch input.
  document.addEventListener('pointerdown', event => { if (event.button === 0) click(event); }, true);
  document.addEventListener('pointerup', unlock, true);
  document.addEventListener('keydown', unlock, true);
  document.addEventListener('click', event => { if (event.detail === 0) click(event); }, true);
}
