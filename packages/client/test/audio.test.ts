import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { commandSound, EFFECTS, eventSounds, gambleSounds, sharedSounds, throttle } from '../src/audio/cues';
import { musicMode, TRACKS, trackFor } from '../src/audio/music';
import { DEFAULT_AUDIO, readAudioSettings, writeAudioSettings } from '../src/audio/preferences';

describe('audio cues', () => {
  test('summons and combinations scale with grade', () => {
    const summon = { type: 'summon', unitId: 1, defId: 'unit', slot: 0 } as const;
    expect(eventSounds({ ...summon, grade: 2 })).toEqual(['swish']);
    expect(eventSounds({ ...summon, grade: 3 })).toEqual(['swish', 'sparkle']);
    const combine = { type: 'combine', unitId: 2, replacedUnitId: 1, defId: 'unit', slot: 0 } as const;
    expect(eventSounds(combine, { grade: 4 })).toEqual(['combine']);
    expect(eventSounds(combine, { grade: 6 })).toEqual(['combineBig']);
    expect(gambleSounds('big', 5)).toEqual(['swish', 'sparkle', 'gambleBig']);
    expect(gambleSounds('small', 2)).toEqual(['swish', 'gambleSmall']);
    expect(gambleSounds('lose')).toEqual(['gambleLose']);
  });

  test('classifies enemies at spawn and kill, and filters watched-lane events', () => {
    const spawn = { type: 'spawn', enemyId: 10, defId: 'enemy' } as const;
    const kill = { type: 'kill', enemyId: 10 } as const;
    expect(eventSounds(spawn, { hunt: true })).toEqual(['huntRoar']);
    expect(eventSounds(spawn, { boss: true })).toEqual(['gong']);
    expect(eventSounds(kill, { boss: true })).toEqual(['bossDown']);
    expect(eventSounds(kill)).toEqual(['kill']);
    expect(eventSounds(kill, { mine: false })).toEqual([]);
    expect(eventSounds(spawn, { mine: false, hunt: true })).toEqual([]);
    expect(eventSounds({ type: 'roundStart', round: 1 }, { mine: false })).toEqual(['round']);
  });

  test('a boss appearing or falling is heard on a watched lane too', () => {
    expect(eventSounds({ type: 'spawn', enemyId: 3, defId: 'boss' }, { mine: false, boss: true })).toEqual(['gong']);
    expect(eventSounds({ type: 'kill', enemyId: 3 }, { mine: false, boss: true })).toEqual(['bossDown']);
  });

  test('the shared 역신 rings once when it arrives and once when the team kills it', () => {
    const none = { yeoksin: null, kills: 0 };
    expect(sharedSounds(undefined, { yeoksin: 1, kills: 0 })).toEqual([]);
    expect(sharedSounds(none, { yeoksin: 1, kills: 0 })).toEqual(['gong']);
    expect(sharedSounds({ yeoksin: 1, kills: 0 }, { yeoksin: 1, kills: 0 })).toEqual([]);
    expect(sharedSounds({ yeoksin: 1, kills: 0 }, { yeoksin: null, kills: 1 })).toEqual(['bossDown']);
    // a visit that times out leaves without a kill
    expect(sharedSounds({ yeoksin: 1, kills: 0 }, { yeoksin: null, kills: 0 })).toEqual([]);
    expect(sharedSounds({ yeoksin: null, kills: 1 }, { yeoksin: 2, kills: 1 })).toEqual(['gong']);
  });

  test('heavy attack, hunt outcomes and rewards have distinct cues', () => {
    const attack = { type: 'attack', unitId: 1, enemyId: 2 } as const;
    expect(eventSounds(attack, { grade: 4 })).toEqual([]);
    expect(eventSounds(attack, { grade: 5 })).toEqual(['heavyHit']);
    expect(eventSounds(attack, { mine: false, grade: 6 })).toEqual([]);
    const hunt = { type: 'hunt', enemy: 'enemy', level: 1, coins: 0, buckwheat: 0 } as const;
    expect(eventSounds({ ...hunt, outcome: 'fled' })).toEqual(['huntFlee']);
    expect(eventSounds({ ...hunt, outcome: 'won', coins: 5 })).toEqual(['reward']);
    expect(eventSounds({ type: 'questReward', quest: 'ssireum', coins: 0, buckwheat: 2, tokens: 0 })).toEqual(['reward']);
  });

  test('a burst of kills is capped at six per second independently of heavy hits', () => {
    const allow = throttle();
    const times = Array.from({ length: 1000 }, (_, ms) => ms).filter(ms => allow('kill', ms));
    expect(times).toEqual([0, 167, 334, 501, 668, 835]);
    expect(allow('heavyHit', 835)).toBe(true);
    expect(allow('heavyHit', 836)).toBe(false);
    expect(allow('kill', 1002)).toBe(true);
  });
});

describe('music selection', () => {
  test('boss rounds and rotating 역신 visits keep boss music active until both end', () => {
    const combat = { phase: 'round' as const, bossRound: false, yeoksin: false };
    expect([
      musicMode({ ...combat, phase: 'prep' }),
      musicMode(combat),
      musicMode({ ...combat, bossRound: true }),
      musicMode({ ...combat, bossRound: true, yeoksin: true }),
      musicMode({ ...combat, yeoksin: true }),
      musicMode({ ...combat, phase: 'prep', yeoksin: true }),
      musicMode(combat),
      musicMode({ ...combat, phase: 'ended', bossRound: true }),
    ]).toEqual(['normal', 'normal', 'boss', 'boss', 'boss', 'boss', 'normal', null]);
    expect(trackFor('normal', DEFAULT_AUDIO)).toBe(84);
    expect(trackFor('boss', DEFAULT_AUDIO)).toBe(197);
    expect(trackFor('boss', DEFAULT_AUDIO, 139)).toBe(139);
    expect(trackFor(null, DEFAULT_AUDIO)).toBeNull();
  });

  test('buying an upgrade and both sale commands have their own cues', () => {
    expect(commandSound('upgrade')).toBe('upgrade');
    expect(commandSound('sell')).toBe('sell');
    expect(commandSound('sellStored')).toBe('sell');
    expect(commandSound('move')).toBeUndefined();
  });
});

describe('audio settings and attribution', () => {
  test('persists both sliders, mute and both selected tracks', () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    const settings = { effects: 0, music: 100, muted: true, normal: 6, boss: 244 } as const;
    expect(readAudioSettings(storage)).toEqual(DEFAULT_AUDIO);
    writeAudioSettings(settings, storage);
    expect(readAudioSettings(storage)).toEqual(settings);
  });

  test('handles malformed values, throwing methods and a throwing localStorage getter', () => {
    const blocked = () => { throw new Error('blocked'); };
    const storage = { getItem: blocked, setItem: blocked };
    expect(readAudioSettings(storage)).toEqual(DEFAULT_AUDIO);
    expect(() => writeAudioSettings(DEFAULT_AUDIO, storage)).not.toThrow();
    const prior = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: blocked });
    try {
      expect(readAudioSettings()).toEqual(DEFAULT_AUDIO);
      expect(() => writeAudioSettings(DEFAULT_AUDIO)).not.toThrow();
    } finally {
      if (prior) Object.defineProperty(globalThis, 'localStorage', prior);
      else Reflect.deleteProperty(globalThis, 'localStorage');
    }
    expect(readAudioSettings({ getItem: () => '{' })).toEqual(DEFAULT_AUDIO);
    expect(readAudioSettings({ getItem: () => '{"effects":250,"music":-10,"muted":"true","normal":1,"boss":60}' }))
      .toEqual({ ...DEFAULT_AUDIO, effects: 100, music: 0, boss: 60 });
  });

  test('all six named tracks, published files and credit entries correspond one-to-one', () => {
    const publicDir = new URL('../public/', import.meta.url);
    const credits = readFileSync(new URL('CREDITS.md', publicDir), 'utf8');
    expect(TRACKS.map(t => t.id)).toEqual([6, 139, 84, 197, 244, 60]);
    expect(readdirSync(new URL('bgm/', publicDir)).sort()).toEqual(TRACKS.map(t => t.file).sort());
    for (const track of TRACKS) {
      const line = credits.split('\n').find(row => row.includes(`bgm/${track.file}`));
      expect(line).toContain(`국악 BGM #${track.id}`);
      expect(line).toContain(track.source);
      expect(line).toContain('주식회사 아이티앤');
      expect(line).toContain('https://creativecommons.org/licenses/by/4.0/');
    }
  });

  test('going over the limit rings error softly, at most once in 2 seconds', () => {
    expect(EFFECTS.limitOver.file).toBe('error.ogg');
    expect(EFFECTS.limitOver.interval).toBe(2000);
    expect(EFFECTS.limitOver.volume).toBeLessThan(EFFECTS.error.volume);
  });

  test('a teammate falling rings the gong low', () => {
    expect(EFFECTS.fallen.file).toBe('gong.ogg');
    expect(EFFECTS.fallen.volume).toBeLessThan(EFFECTS.gong.volume);
    expect(EFFECTS.fallen.interval).toBe(450);
  });

  test('every shipped effect is used and credited, next to the Kenney license', () => {
    const publicDir = new URL('../public/', import.meta.url);
    const credits = readFileSync(new URL('CREDITS.md', publicDir), 'utf8');
    const used = [...new Set(Object.values(EFFECTS).map(e => e.file))].sort();
    expect(readdirSync(new URL('sfx/', publicDir)).filter(f => f !== 'LICENSE-kenney.txt').sort()).toEqual(used);
    for (const file of used) expect(credits).toContain(`\`sfx/${file}\``);
    expect(readFileSync(new URL('sfx/LICENSE-kenney.txt', publicDir), 'utf8')).toContain('CC0');
  });
});
