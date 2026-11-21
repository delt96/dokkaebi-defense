import Phaser from 'phaser';
import type { GameData } from '@dorandi/logic';
import { LaneScene } from '../LaneScene';
import { LANE_CANVAS_ONLINE, stagePlacement } from '../layout';
import type { NetClient } from '../net/NetClient';
import { NetDriver } from '../net/NetDriver';
import { mountUi } from '../ui/mount';
import '../ui/style.css';

/** The online battle screen: the 1-player stage in layout A, drawn from the server's view. */
export function startBattle(net: NetClient, data: GameData): void {
  document.body.classList.add('online');
  const driver = new NetDriver(net, data);
  const scene = new LaneScene(driver, { height: LANE_CANVAS_ONLINE.height });

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'lane',
    width: LANE_CANVAS_ONLINE.width,
    height: scene.canvasHeight,
    pixelArt: true,
    backgroundColor: '#0d0a14',
    scale: { mode: Phaser.Scale.NONE },
    scene,
  });

  const stage = document.getElementById('stage')!;
  function fit(): void {
    const p = stagePlacement(window.innerWidth, window.innerHeight);
    stage.style.transform = `scale(${p.zoom})`;
    stage.style.left = `${p.left}px`;
    stage.style.top = `${p.top}px`;
    game.scale.refresh();
  }
  window.addEventListener('resize', fit);
  fit();

  mountUi(driver, scene, {}, { online: true, view: () => net.view, data });

  if (import.meta.env.DEV) Object.assign(window, { __net: net, __driver: driver, __scene: scene });
}
