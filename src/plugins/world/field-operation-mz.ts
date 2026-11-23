/** Pause native parent input/interpreters while a returned-to-map field operation owns the UI. */
import { hostRecord } from './host-access';
export function installFieldOperationMZ(root: Record<string, unknown>, pending: () => boolean,
  ownedArrival: (player: object) => boolean | null = () => null,
  recoveryOnly: () => boolean = () => false): void {
  for (const [name, key, refused] of [
    ['Game_Player', 'canMove', false], ['Scene_Map', 'isMenuEnabled', false],
    ['Game_Map', 'updateInterpreter', undefined], ['Game_Event', 'updateParallel', undefined], ['Game_CommonEvent', 'update', undefined],
    ['Game_Player', 'updateRoutineMove', undefined],
  ] as const) {
    const target = hostRecord(hostRecord(root[name])?.prototype), method = target?.[key];
    if (!target || typeof method !== 'function') continue;
    target[key] = function(this: unknown, ...args: unknown[]): unknown {
      const running = pending(), recovery = recoveryOnly();
      // A stable failure offers a recovery-only native menu, even if an event disabled the normal menu.
      if (name === 'Scene_Map' && key === 'isMenuEnabled' && recovery && !running) return true;
      const blocked = (name !== 'Game_Player' || key !== 'updateRoutineMove' || this === root.$gamePlayer) && (running || recovery && key !== 'isMenuEnabled');
      if (name === 'Game_Player' && key === 'canMove' && this === root.$gamePlayer && this && typeof this === 'object') {
        const arrival = ownedArrival(this);
        if (recovery && !running || arrival === false || blocked && arrival !== true) return refused;
      } else if (blocked) return refused;
      return Reflect.apply(method, this, args);
    };
  }
}
