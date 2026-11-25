import { screenLayout, type ScreenLayout, type WinBox, type WinPlace } from './layout';

function placeBox(id: string, box: WinBox, l: ScreenLayout): void {
  const node = document.getElementById(id);
  if (!node) return;
  node.style.left = `${box.x}px`;
  node.style.top = `${box.y}px`;
  node.style.width = `${box.w}px`;
  node.style.height = `${box.h}px`;
  // CSS zoom would also multiply left/top, moving the box off its screen-px spot; scale like the board instead.
  node.style.transform = `scale(${l.winZoom})`;
  node.classList.toggle('outside', l.wins === 'outside');
  node.classList.toggle('inside', l.wins === 'inside');
}

export function applyLayout(l: ScreenLayout, stage: HTMLElement): void {
  stage.style.transform = `scale(${l.zoom})`;
  stage.style.left = `${l.left}px`;
  stage.style.top = `${l.top}px`;
  placeBox('win-left', l.winLeft, l);
  placeBox('win-right', l.winRight, l);
  document.documentElement.dataset.wins = l.wins;
}

export function currentWins(): WinPlace {
  return document.documentElement.dataset.wins === 'outside' ? 'outside' : 'inside';
}

export function applyOuterZoom(w: number, h: number): void {
  document.documentElement.style.setProperty('--outer-zoom', String(screenLayout(w, h).outerZoom));
}
