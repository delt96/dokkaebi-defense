import Phaser from 'phaser';
import type { GameData } from '@dorandi/logic';
import { bindBattleAudio } from '../audio/battle';
import { LaneScene } from '../LaneScene';
import { applyLayout } from '../fit';
import { LANE_CANVAS_ONLINE, screenLayout } from '../layout';
import type { NetClient } from '../net/NetClient';
import { NetDriver } from '../net/NetDriver';
import { mountUi } from '../ui/mount';
import { watchSupport } from './models';
import { mountResult } from './result';
import { onlineActions } from './spirit';
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
    // the band is scaled by CSS zoom, so read its drawn height rather than offsetHeight
    const bandH = band?.getBoundingClientRect().height ?? 0;
    applyLayout(screenLayout(window.innerWidth, window.innerHeight, { band: bandH, online: true }), stage);
    game.scale.refresh();
  }
  window.addEventListener('resize', fit);
  if (band) new ResizeObserver(fit).observe(band);
  fit();

  const ui = mountUi(driver, scene, {}, {
    online: true, view: () => net.view, data,
    targetKey: `dorandi.target:${net.roomId}:${net.view?.me.seat}`,
    actions: onlineActions(net),
  });

  // the team result (also carried by a rejoin snapshot) covers the stage, after the end scene when one runs
  const screen = document.getElementById('screen');
  if (screen) mountResult(net, screen, data, undefined, goRematch, show => ui.afterEndScene(show));

  if (import.meta.env.DEV) Object.assign(window, { __net: net, __driver: driver, __scene: scene });
}
