import type { RngState } from './types';

export function createRng(seed: number): RngState {
  return { s: seed >>> 0 };
}

function mix(x: number): number {
  let t = (x + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

export function nextFloat(r: RngState): number {
  r.s = (r.s + 0x6d2b79f5) >>> 0;
  return mix((r.s - 0x6d2b79f5) >>> 0) / 4294967296;
}

export function nextInt(r: RngState, n: number): number {
  return Math.floor(nextFloat(r) * n);
}

export function deriveSeed(seed: number, label: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < label.length; i++) {
    h ^= label.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return mix((h ^ (seed >>> 0)) >>> 0);
}
