import type { CompletedHostStep } from './step-host';
import { hostRecord, invoke } from './host-access';

interface Terminal { readonly step: Readonly<CompletedHostStep>; readonly scene: object; valid: boolean }
export type TerminalEncounterExit = 'completed' | 'deferred' | 'refused';
/** A synchronous continuation of one completed step. It neither acquires an App owner nor releases another one. */
export function createTerminalEncounterMZ(root: Record<string, unknown>) {
  let terminal: Terminal | null = null;
  let callbackDepth = 0;
  const retired = new WeakSet<object>();
  const matches = (entry: Terminal): boolean => {
    if (!entry.valid) return false;
    const step = entry.step, flow = hostRecord(root.PSFlow), app = hostRecord(flow?._app), manager = hostRecord(root.SceneManager);
    const player = hostRecord(root.$gamePlayer), map = root.$gameMap;
    if (app !== step.owner.owner || app?.stateGeneration !== step.owner.generation || manager?._scene !== entry.scene || manager._nextScene ||
      root.$gamePlayer !== step.player || map !== step.owner.map || player?.x !== step.x || player.y !== step.y || app.encounterBlocked === true) return false;
    const mapId = invoke(map, 'mapId');
    // Host queries may replace objects/scene/generation before returning an old value.
    return mapId === step.owner.mapId && hostRecord(root.PSFlow)?._app === app && app.stateGeneration === step.owner.generation &&
      hostRecord(root.SceneManager)?._scene === entry.scene && !hostRecord(root.SceneManager)?._nextScene &&
      root.$gamePlayer === step.player && root.$gameMap === step.owner.map && player.x === step.x && player.y === step.y && app.encounterBlocked !== true;
  };
  const assert = (entry: Terminal): void => {
    if (!matches(entry)) { entry.valid = false; retired.add(entry.step.player); throw new Error('stale-completed-encounter'); }
  };
  const allowed = (player: object, countReset = false): boolean => {
    const entry = terminal;
    if (!entry) return countReset || !retired.has(player);
    if (!countReset && callbackDepth > 0) return false;
    if (entry.step.player !== player) return false;
    try { assert(entry); return true; } catch { return false; }
  };
  return {
    allowed: (player: object): boolean => allowed(player),
    countAllowed: (player: object): boolean => allowed(player, true),
    countReset(player: object): void { if (allowed(player, true)) retired.delete(player); },
    retire(step: Readonly<CompletedHostStep>): void { retired.add(step.player); if (terminal?.step === step) terminal.valid = false; },
    run(step: Readonly<CompletedHostStep>, scene: object, dispatch: () => TerminalEncounterExit): void {
      if (terminal) return; // A reentrant poll cannot create another continuation of this terminal step.
      const entry: Terminal = { step, scene, valid: true }, restore: (() => void)[] = [];
      let exit: TerminalEncounterExit | 'failed' = 'failed';
      callbackDepth = 0;
      terminal = entry; retired.delete(step.player);
      const wrap = (owner: unknown, key: string, after: boolean): void => {
        const record = hostRecord(owner), original = record?.[key]; if (!record || typeof original !== 'function') return;
        const descriptor = Object.getOwnPropertyDescriptor(record, key);
        const wrapped = function(this: unknown, ...args: unknown[]): unknown {
          // A fact callback may itself finish a legitimate scene/state replacement. Let that callback finish;
          // its outer return is the boundary that rejects further work from this old terminal continuation.
          if (after && callbackDepth > 0 && !matches(entry)) return Reflect.apply(original, this, args);
          assert(entry); callbackDepth++;
          let result: unknown;
          try { result = Reflect.apply(original, this, args); } finally { callbackDepth--; }
          if (after) assert(entry); return result;
        };
        Object.defineProperty(record, key, { configurable: true, writable: true, value: wrapped });
        restore.push(() => { if (record[key] === wrapped) { if (descriptor) Object.defineProperty(record, key, descriptor); else delete record[key]; } });
      };
      try {
        assert(entry);
        // Actual consumers query these facts before drawing native counts/candidates or installing a battle.
        for (const key of ['content', 'mapEncounters', 'assertBattleAllowed', 'encounter']) wrap(root.PSFlow, key, true);
        for (const key of ['isEventRunning', 'encounterStep', 'encounterList']) wrap(step.owner.map, key, true);
        for (const key of ['isTransferring', 'meetsEncounterConditions', 'makeEncounterTroopId']) wrap(step.player, key, true);
        wrap(scene, 'isActive', true); wrap(root.SceneManager, 'isSceneChanging', true); wrap(root.$gameMessage, 'isBusy', true);
        // These are the concrete effect boundaries used by native/legacy, never an independently scheduled action.
        for (const key of ['random', 'nextSeq', 'tryOpenBattle', 'openBattle']) wrap(root.PSFlow, key, false);
        wrap(root.BattleManager, 'setup', false); wrap(root.BattleManager, 'onEncounter', false); wrap(root.SceneManager, 'push', false);
        assert(entry); exit = dispatch();
      } finally {
        // Ordinary exceptions/refusals are terminal failures too, even when the identity stayed current.
        // A normal native busy gate is a legal delay, so it retains the native countdown semantics.
        if (exit === 'failed' || exit === 'refused' || !entry.valid) retired.add(step.player);
        try { for (const undo of restore.reverse()) undo(); }
        finally { if (terminal === entry) terminal = null; }
      }
    },
  };
}
