import Phaser from 'phaser';
import type { GameData } from '@dorandi/logic';
import { bindBattleAudio } from '../audio/battle';
import { LaneScene } from '../LaneScene';
import { LANE_CANVAS_ONLINE, STAGE_H, STAGE_W, stagePlacement } from '../layout';
import type { NetClient } from '../net/NetClient';
import { NetDriver } from '../net/NetDriver';
import { mountUi } from '../ui/mount';
import { watchSupport } from './models';
import { mountResult } from './result';
import '../ui/style.css';

/** The online battle screen: the 1-player stage in layout A, drawn from the server's view. */
export function startBattle(net: NetClient, data: GameData, goRematch: (roomId: string, hostToken?: string) => void): void {
  document.body.classList.add('online');
  const driver = new NetDriver(net, data);
  bindBattleAudio(driver, net);
  watchSupport(net);
  const scene = new LaneScene(driver, { height: LANE_CANVAS_ONLINE.height });

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    audio: { noAudio: true },
    parent: 'lane',
    width: LANE_CANVAS_ONLINE.width,
    height: scene.canvasHeight,
    pixelArt: true,
    backgroundColor: '#0d0a14',
    scale: { mode: Phaser.Scale.NONE },
    scene,
  });

  const stage = document.getElementById('stage')!;
  const band = document.getElementById('conn-band');
  function fit(): void {
    const { innerWidth: width, innerHeight: height } = window;
    const available = height - (band?.offsetHeight ?? 0);
    const p = stagePlacement(width, height);
    const zoom = band?.offsetHeight ? Math.min(p.zoom, available / STAGE_H) : p.zoom;
    stage.style.transform = `scale(${zoom})`;
    stage.style.left = `${Math.max(0, Math.floor((width - STAGE_W * zoom) / 2))}px`;
    stage.style.top = `${Math.floor(Math.max(0, available - STAGE_H * zoom) / 2)}px`;
    game.scale.refresh();
  }
  window.addEventListener('resize', fit);
  if (band) new ResizeObserver(fit).observe(band);
  fit();

  mountUi(driver, scene, {}, {
    online: true, view: () => net.view, data,
    targetKey: `dorandi.target:${net.roomId}:${net.view?.me.seat}`,
    actions: {
      support: () => { if (net.view) net.send({ type: 'support', target: net.view.watching }); },
      watch: seat => net.watch(seat),
      forfeit: () => { net.send({ type: 'forfeit' }); },
    },
  });

  // the team result (also carried by a rejoin snapshot) covers the stage
  const screen = document.getElementById('screen');
  if (screen) mountResult(net, screen, data, undefined, goRematch);

  if (import.meta.env.DEV) Object.assign(window, { __net: net, __driver: driver, __scene: scene });
}
