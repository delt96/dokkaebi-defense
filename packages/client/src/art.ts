import { FX_KEYS, textureKey } from './fx/atlas';

const BASE = import.meta.env.BASE_URL;
export const SPRITE_IDS: ReadonlySet<string> = new Set(
  Object.keys(import.meta.glob('../public/sprites/*.png')).map(path => path.slice(path.lastIndexOf('/') + 1, -4)),
);

type ArtFile = { key: string; image: string; atlas?: string };
export const spriteFile = (id: string): ArtFile => ({ key: id, image: `${BASE}sprites/${id}.png` });
export const FX_FILES: readonly ArtFile[] = FX_KEYS.map(key => ({
  key: textureKey(key), image: `${BASE}fx/${key}.png`, atlas: `${BASE}fx/${key}.json`,
}));

type Art = { image: HTMLImageElement; atlas: object | null };
const loading = new Map<string, Promise<Art>>();

/** Share decoded images and atlas data between the lobby and Phaser, even on a cold cache. */
export function loadArt(file: ArtFile, background = false): Promise<Art> {
  const pending = loading.get(file.key);
  if (pending) return pending;
  const image = new Image();
  image.fetchPriority = background ? 'low' : 'auto';
  image.src = file.image;
  const atlas = file.atlas ? fetch(file.atlas, { priority: background ? 'low' : 'auto' }).then(response => {
    if (!response.ok) throw new Error(`Unable to load ${file.atlas}`);
    return response.json() as Promise<object>;
  }) : Promise.resolve(null);
  const request = Promise.all([image.decode(), atlas]).then(([, data]) => ({ image, atlas: data })).catch(error => {
    loading.delete(file.key);
    throw error;
  });
  loading.set(file.key, request);
  return request;
}

export function warmArt(): void {
  for (const file of [...Array.from(SPRITE_IDS, spriteFile), ...FX_FILES]) {
    void loadArt(file, true).catch(() => { /* The match loader can retry failed requests. */ });
  }
}
