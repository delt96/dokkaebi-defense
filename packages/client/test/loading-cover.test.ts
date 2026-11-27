// @vitest-environment happy-dom
import { expect, test } from 'vitest';
import { coverWhileLoading } from '../src/ui/loading';

test('the board is covered with the load share until the scene is in', () => {
  const host = document.createElement('div');
  const scene: { onLoadProgress?: (share: number) => void } = {};
  coverWhileLoading(scene, host);
  const cover = () => host.querySelector('.load-cover');
  expect(cover()!.querySelector('b')!.textContent).toBe('그림 불러오는 중 0%');
  expect(cover()!.textContent).toContain('다 받으면 바로 시작합니다');
  scene.onLoadProgress!(0.63);
  expect(cover()!.querySelector('b')!.textContent).toBe('그림 불러오는 중 63%');
  expect(cover()!.querySelector<HTMLElement>('.load-cover-bar > i')!.style.width).toBe('63%');
  scene.onLoadProgress!(1);
  expect(cover()).toBeNull();
});
