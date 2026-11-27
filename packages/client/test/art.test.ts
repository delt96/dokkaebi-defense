// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const images: { src: string; fetchPriority: string; fail: boolean }[] = [];
let failNext = false;

beforeEach(() => {
  vi.resetModules();
  images.length = 0;
  failNext = false;
  vi.stubGlobal('Image', class {
    src = '';
    fetchPriority = 'auto';
    fail = failNext;
    constructor() { images.push(this); }
    decode(): Promise<void> { return this.fail ? Promise.reject(new Error('decode')) : Promise.resolve(); }
  });
  vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve({ ok: true, json: () => Promise.resolve({ url }) })));
});
afterEach(() => vi.unstubAllGlobals());

test('the lobby warms every sprite and fx sheet at low priority, and the match reuses those requests', async () => {
  const { FX_FILES, SMALL_IDS, SPRITE_IDS, loadArt, smallFile, spriteFile, warmArt } = await import('../src/art');
  warmArt();
  const total = SPRITE_IDS.size + SMALL_IDS.size + FX_FILES.length;
  expect(SMALL_IDS.has('japgwi')).toBe(true);
  expect(images).toHaveLength(total);
  expect(images.every(i => i.fetchPriority === 'low')).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(FX_FILES.length);
  const id = [...SPRITE_IDS][0]!;
  const warmed = await loadArt(spriteFile(id));
  const sheet = await loadArt(FX_FILES[0]!);
  // the 24px lane art has its own key, so it does not share the 32px art's request
  const small = await loadArt(smallFile('japgwi'));
  expect(images).toHaveLength(total);
  expect(small.image.src).toContain('sprites/small/japgwi.png');
  expect(warmed.image.src).toContain(`sprites/${id}.png`);
  expect(sheet.atlas).toEqual({ url: FX_FILES[0]!.atlas });
});

test('a failed request is forgotten so the match loader can try again', async () => {
  const { loadArt, spriteFile } = await import('../src/art');
  failNext = true;
  await expect(loadArt(spriteFile('ki'))).rejects.toThrow();
  failNext = false;
  await expect(loadArt(spriteFile('ki'))).resolves.toMatchObject({ atlas: null });
  expect(images).toHaveLength(2);
});

test('progress counts the warmed files as they settle, failed ones too; nothing warmed reads as done', async () => {
  const { FX_FILES, SMALL_IDS, SPRITE_IDS, artProgress, onArtProgress, warmArt } = await import('../src/art');
  expect(artProgress()).toEqual({ done: 0, total: 0 });
  let calls = 0;
  onArtProgress(() => { calls++; });
  failNext = true;
  warmArt();
  failNext = false;
  const total = SPRITE_IDS.size + SMALL_IDS.size + FX_FILES.length;
  expect(artProgress()).toEqual({ done: 0, total });
  await new Promise(r => setTimeout(r, 0));
  expect(artProgress()).toEqual({ done: total, total });
  expect(calls).toBe(total);
});
