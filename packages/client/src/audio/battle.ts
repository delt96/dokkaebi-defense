import type { ClientView, GameState } from '@dorandi/logic';
import type { Driver } from '../driver';
import type { NetClient } from '../net/NetClient';
import { commandSound, eventSounds, sharedSounds, type SharedField } from './cues';
import { gameAudio } from './engine';
import { musicMode } from './music';

function syncMusic(state: GameState, view?: ClientView): void {
  const phase = view ? (view.result ? 'ended' : view.clock.phase) : state.phase;
  const round = view?.clock.round ?? state.round;
  const bossRound = state.data.waves.some(wave => wave.round === round && wave.type === 'boss');
  gameAudio.musicMode(musicMode({ phase, bossRound, yeoksin: !!view?.yeoksin }));
}

const sharedField = (view: ClientView): SharedField => ({ yeoksin: view.yeoksin?.stage ?? null, kills: view.gate.kills });

/**
 * Sounds for one battle page. Lane events give the own lane's sounds (a watched lane only gives
 * boss cues); online, the shared 역신 and the result come from the match view instead.
 */
export function bindBattleAudio(driver: Driver, net?: NetClient): () => void {
  const { data } = driver.state;
  const grades = new Map(data.units.map(unit => [unit.id, unit.grade]));
  const bossDefs = new Set(data.enemies.filter(enemy => enemy.boss).map(enemy => enemy.id));
  const huntDefs = new Set(data.economy?.hunts?.targets.map(target => target.enemy));
  const bosses = new Set<number>();
  let epoch = driver.laneEpoch;
  const reset = () => {
    epoch = driver.laneEpoch;
    bosses.clear();
    for (const enemy of driver.state.enemies) if (enemy.boss) bosses.add(enemy.id);
    syncMusic(driver.state, net?.view ?? undefined);
  };
  reset();

  driver.onEvents((events, rejected) => {
    if (epoch !== driver.laneEpoch) reset();
    const mine = !driver.readOnly;
    if (rejected.length && mine) gameAudio.play('error');
    for (const event of events) {
      let grade: number | undefined;
      let boss = false;
      let hunt = false;
      switch (event.type) {
        case 'spawn':
          boss = bossDefs.has(event.defId);
          hunt = huntDefs.has(event.defId);
          if (boss) bosses.add(event.enemyId);
          break;
        case 'kill':
          // the shared 역신 (a negative id) is rung from the match view, once for the whole team
          if (event.enemyId < 0) continue;
          boss = bosses.delete(event.enemyId);
          break;
        case 'tame': bosses.delete(event.enemyId); break;
        case 'combine': grade = grades.get(event.defId); break;
        case 'attack': {
          if (!mine) continue;
          const unit = driver.state.slots.find(unit => unit?.id === event.unitId);
          grade = unit ? grades.get(unit.defId) : undefined;
          break;
        }
        case 'roundStart':
        case 'ended': if (!net) syncMusic(driver.state); break;
      }
      for (const sound of eventSounds(event, { mine, grade, boss, hunt })) gameAudio.play(sound);
    }
  });
  driver.onAccepted?.(type => {
    const sound = commandSound(type);
    if (sound) gameAudio.play(sound);
  });

  if (net) {
    let ended = !!net.view?.result;
    let field = net.view ? sharedField(net.view) : undefined;
    net.on(event => {
      if (event.kind !== 'view' && event.kind !== 'result') return;
      const view = net.view;
      if (!view) return;
      syncMusic(driver.state, view);
      const next = sharedField(view);
      for (const sound of sharedSounds(field, next)) gameAudio.play(sound);
      field = next;
      if (!ended && view.result) {
        ended = true;
        gameAudio.play(view.result.outcome === 'clear' ? 'clear' : 'defeat');
      }
    });
  }
  return reset;
}
