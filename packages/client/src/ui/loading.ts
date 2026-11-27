/** Covers `host` (the board) with the art load share until the scene reports 1, then takes the cover away. */
export function coverWhileLoading(scene: { onLoadProgress?: (share: number) => void }, host: HTMLElement): void {
  const cover = document.createElement('div');
  cover.className = 'load-cover';
  cover.setAttribute('role', 'status');
  cover.innerHTML = '<b></b><div class="load-cover-bar"><i></i></div><small>다 받으면 바로 시작합니다</small>';
  const title = cover.querySelector('b')!;
  const fill = cover.querySelector<HTMLElement>('.load-cover-bar > i')!;
  const show = (share: number) => {
    const pct = Math.floor(share * 100);
    title.textContent = `그림 불러오는 중 ${pct}%`;
    fill.style.width = `${pct}%`;
  };
  show(0);
  host.append(cover);
  scene.onLoadProgress = share => {
    if (share >= 1) {
      cover.remove();
      scene.onLoadProgress = undefined;
    } else show(share);
  };
}
