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
  const { FX_FILES, SPRITE_IDS, loadArt, spriteFile, warmArt } = await import('../src/art');
  warmArt();
  expect(images).toHaveLength(SPRITE_IDS.size + FX_FILES.length);
  expect(images.every(i => i.fetchPriority === 'low')).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(FX_FILES.length);
  const id = [...SPRITE_IDS][0]!;
  const warmed = await loadArt(spriteFile(id));
  const sheet = await loadArt(FX_FILES[0]!);
  expect(images).toHaveLength(SPRITE_IDS.size + FX_FILES.length);
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
