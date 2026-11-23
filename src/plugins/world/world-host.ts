import type { OwnedSurfLandingHold } from '../../framework/app/surf-landing-ports';
import type { WorldMovementStartLifecycle } from '../../framework/app/movement-start-ports';
import type { BlackoutApplicationQueries } from '../../framework/app/blackout-ports';
import type { ConnectionStepGateway } from './completed-step-mz';
import type { HostApplication } from '../application-host';
import type { FieldItemExecutionPort, FieldItemHandoff, FieldItemRunOutcome } from '../../framework/app';
import type { LegacyWeatherInput } from '../../framework/rules/world-state';
import type { FishingWorldPort } from '../../framework/app/world-operation';
import type { OrdinaryEncounterHostPort, FieldEncounterHostPort } from '../../framework/app/ports';
import type { CompletedStepHostPort } from '../../framework/app/ports';
import type { FieldMoveExecutionPort } from '../../framework/app';
import { hostRecord } from './host-access';
export { hostRecord, invoke } from './host-access';

/** Narrow, checked access to the dynamic MZ boundary. Save inputs use own data only. */
export function ownData(value: unknown, key: string): unknown {
  const record = hostRecord(value);
  if (!record) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
}
export function errorText(error: unknown): string { return error instanceof Error ? error.message : String(error); }

export function legacyWeatherSnapshot(contents: unknown): LegacyWeatherInput {
  const screen = ownData(contents, 'screen');
  return { type: ownData(screen, '_weatherType'), targetPower: ownData(screen, '_weatherPowerTarget'), durationFrames: ownData(screen, '_weatherDuration') };
}

const GAME_OBJECTS = ['$gameTemp', '$gameSystem', '$gameScreen', '$gameTimer', '$gameMessage', '$gameSwitches', '$gameVariables', '$gameSelfSwitches', '$gameActors', '$gameParty', '$gameTroop', '$gameMap', '$gamePlayer'] as const;
/** loadGame creates these before extract. Restore exact references if its promise rejects. */
export function captureGameObjects(root: Record<string, unknown>): () => void {
  const saved = GAME_OBJECTS.map(key => ({ key, descriptor: Object.getOwnPropertyDescriptor(root, key) }));
  return () => { for (const { key, descriptor } of saved) { if (descriptor) Object.defineProperty(root, key, descriptor); else delete root[key]; } };
}

export type WorldApplication = Pick<HostApplication, 'stateGeneration' | 'worldFacts' | 'enterWorldMap' | 'observeWorldMapEntry' | 'flushWorldNotices' | 'setWorldWeather' | 'runFieldItemHandoff' | 'cancelFieldItemHandoff'> & Partial<Pick<BlackoutApplicationQueries, 'ownsBlackoutNativeEntry'>>;
export type FieldItemApplication = Pick<HostApplication, 'stateGeneration' | 'runFieldItemHandoff' | 'cancelFieldItemHandoff'> & Partial<Pick<HostApplication, 'abortAdmittedWorldBattle'>>;
export function isWorldApplication(value: unknown): value is WorldApplication {
  const record = hostRecord(value);
  return !!record && Number.isSafeInteger(record.stateGeneration) && ['worldFacts', 'enterWorldMap', 'observeWorldMapEntry', 'flushWorldNotices', 'setWorldWeather', 'runFieldItemHandoff', 'cancelFieldItemHandoff'].every(key => typeof record[key] === 'function');
}
export interface WorldPlugin {
  loadSucceeded(): void;
  pending(): boolean;
  queueFieldItem(application: FieldItemApplication, handoff: Readonly<FieldItemHandoff>, done: (outcome: FieldItemRunOutcome) => void): void;
  cancelFieldItem(token: string): void;
  readonly fieldItems: FieldItemExecutionPort;
  readonly fieldMoves?: FieldMoveExecutionPort;
  readonly completedSteps?: CompletedStepHostPort;
  readonly connectionSteps?: ConnectionStepGateway;
  readonly surfLandings?: { hold(proof: Extract<WorldMovementStartLifecycle, { kind: 'jump' }>, retiredLanding: () => void, sameMotion: () => boolean): OwnedSurfLandingHold };
  retireSurfLanding?(context: object): void;
  readonly runtimeInputs?: { readonly ordinary: OrdinaryEncounterHostPort; readonly fishing: FishingWorldPort; readonly field?: FieldEncounterHostPort; readonly generation?: { environment(): import('../../framework/rules/world-data').WorldFact<keyof typeof import('../../framework/rules/initial-field').ENVIRONMENT> } };
  stepStateReplaced?(): void;
}
export interface MZEncounterMethods {
  nativeEncounter(player: object): boolean;
  legacyEncounter(player: object): boolean;
  makeCount(player: object, args: readonly unknown[]): unknown;
  updateCount(player: object, args: readonly unknown[]): unknown;
}
export function worldPlugin(value: unknown): WorldPlugin | null {
  const record = hostRecord(value);
  return record && ['loadSucceeded', 'pending', 'queueFieldItem', 'cancelFieldItem'].every(key => typeof record[key] === 'function') && typeof hostRecord(record.fieldItems)?.execute === 'function' ? value as WorldPlugin : null;
}
