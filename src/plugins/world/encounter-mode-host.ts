import { hostRecord, invoke } from './host-access';
import type { CompletedHostStep } from './step-host';

export type EncounterMode = 'framework' | 'legacy-note' | 'mz-native' | 'none';
export type EncounterModeResolution = { readonly status: 'ready'; readonly mode: EncounterMode } |
  { readonly status: 'unavailable'; readonly reason: string };
/** Formal tables win only without an old note. Empty native troop lists mean explicit random-encounter absence. */
export function resolveMZEncounterMode(mapId: unknown, contentValue: unknown, dataMapValue: unknown): EncounterModeResolution {
  const content = hostRecord(contentValue), dataMap = hostRecord(dataMapValue);
  if (!Number.isSafeInteger(mapId) || typeof mapId !== 'number' || mapId <= 0 || !content || !dataMap) return { status: 'unavailable', reason: 'encounter-mode-facts-unavailable' };
  const world = content.world === undefined ? undefined : hostRecord(content.world);
  if (content.world !== undefined && !world) return { status: 'unavailable', reason: 'formal-world-invalid' };
  const encounters = world?.encounters === undefined ? undefined : hostRecord(world.encounters);
  if (world?.encounters !== undefined && (!encounters || !Array.isArray(encounters.tables))) return { status: 'unavailable', reason: 'formal-encounters-invalid' };
  const formal = encounters && Array.isArray(encounters.tables) && encounters.tables.some((table: unknown) => hostRecord(table)?.mapId === mapId);
  const note = hostRecord(dataMap.meta)?.PSEncounter !== undefined;
  if (formal && note) return { status: 'unavailable', reason: 'formal-table-note-conflict' };
  if (formal) return { status: 'ready', mode: 'framework' };
  if (note) return { status: 'ready', mode: 'legacy-note' };
  if (!Array.isArray(dataMap.encounterList)) return { status: 'unavailable', reason: 'native-encounter-list-unavailable' };
  return { status: 'ready', mode: dataMap.encounterList.length ? 'mz-native' : 'none' };
}
export interface EncounterModeHostPorts {
  /** The content/application resolver diagnoses formal-table/note conflicts and never turns a failed load into native. */
  mode(): EncounterModeResolution;
  takeCompletedStep(player: object): Readonly<CompletedHostStep> | null;
  /** True only when a battle was accepted; probability/allowance rejection returns false. */
  frameworkStep(step: Readonly<CompletedHostStep>): boolean;
  /** Supply the original native method and the preserved legacy-note method explicitly, independent of install order. */
  nativeEncounter(player: object): boolean;
  legacyEncounter(player: object): boolean;
  nativeMakeCount?(player: object, args: readonly unknown[]): unknown;
  nativeUpdateCount?(player: object, args: readonly unknown[]): unknown;
  randomBlocked?(): boolean;
  terminalAllowed?(player: object): boolean;
  terminalCountAllowed?(player: object): boolean;
  countReset?(player: object): void;
  diagnostic(reason: string): void;
  failed(step: Readonly<CompletedHostStep>, error: unknown): void;
}

/**
 * All existing makeEncounterCount callers, including 136/301/locate/disembark and framework prebattle/legacy calls,
 * reach this dispatcher. Framework grace/accumulator resets remain named application operations (battle/Surf/entry),
 * because a generic count request cannot distinguish a same-map locate from a real entry or battle boundary.
 */
export function installEncounterModeHost(rootValue: unknown, ports: EncounterModeHostPorts): void {
  const root = hostRecord(rootValue), prototype = hostRecord(hostRecord(root?.Game_Player)?.prototype);
  const makeCount = prototype?.makeEncounterCount, updateCount = prototype?.updateEncounterCount;
  if (!root || !prototype || typeof makeCount !== 'function' || typeof updateCount !== 'function') throw new Error('encounter-mode-host-surface-unavailable');
  let lastProblem: string | null = null;
  const problem = (reason: string): void => { if (lastProblem !== reason) { lastProblem = reason; ports.diagnostic(reason); } };
  const mode = (): EncounterMode | null => {
    try {
      const result = ports.mode();
      if (result.status === 'ready' && ['framework', 'legacy-note', 'mz-native', 'none'].includes(result.mode)) {
        lastProblem = null; return result.mode;
      }
      problem(result.status === 'unavailable' ? result.reason : 'invalid-encounter-mode');
    } catch (error) { problem(error instanceof Error ? error.message : String(error)); }
    return null;
  };
  prototype.makeEncounterCount = function(this: object, ...args: unknown[]): unknown {
    const current = mode();
    if (ports.terminalCountAllowed?.(this) === false) return undefined;
    if (current === 'legacy-note' || current === 'mz-native') {
      const result = ports.nativeMakeCount ? ports.nativeMakeCount(this, args) : Reflect.apply(makeCount, this, args);
      ports.countReset?.(this); return result;
    }
    const player = hostRecord(this);
    if (player) player._encounterCount = 0; // Deterministic inert native count in framework/none/unavailable.
    return undefined;
  };
  prototype.updateEncounterCount = function(this: object, ...args: unknown[]): unknown {
    const current = mode();
    if (current === 'legacy-note' || current === 'mz-native') return ports.nativeUpdateCount ? ports.nativeUpdateCount(this, args) : Reflect.apply(updateCount, this, args);
    if (current !== 'framework') return undefined;
    const step = ports.takeCompletedStep(this);
    if (!step) return undefined;
    try {
      const enabled = invoke(root.$gameSystem, 'isEncounterEnabled');
      if (typeof enabled !== 'boolean') { problem('encounter-enabled-unavailable'); return undefined; }
      if (enabled) {
        const opened = ports.frameworkStep(step);
        if (typeof opened !== 'boolean') throw new Error('framework-encounter-result-unavailable');
        if (opened) invoke(root.$gameTemp, 'clearDestination');
      }
    } catch (error) { ports.failed(step, error); }
    return undefined;
  };
  prototype.executeEncounter = function(this: object): boolean {
    const current = mode();
    if (ports.terminalAllowed?.(this) === false) return false;
    if (ports.randomBlocked?.()) return false;
    if (ports.terminalAllowed?.(this) === false) return false;
    if (current === 'legacy-note') return ports.legacyEncounter(this);
    if (current === 'mz-native') return ports.nativeEncounter(this);
    return false; // Scene_Map polls this every frame; only the one completed-step ticket may start framework work.
  };
}
