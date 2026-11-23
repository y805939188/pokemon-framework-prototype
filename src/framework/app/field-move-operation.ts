import type { OwnedSurfLandingBound } from './surf-landing-ports';
/** E2 execution child. The real WorldOperation owns admission, lifetime and the sole atomic writer. */
import type { MovementStartResult } from './movement-start-ports';
import { checkRockSmashTrigger, planFieldMove } from '../rules/field-moves';
import type { FieldMoveEntry, FieldMoveFacts, FieldMoveFacingEvent, FieldMovePlan, FieldMoveStage, LocalFieldMoveId } from '../rules/field-moves';
import { isEncounterType } from '../rules/encounter-selection';
import type { FormalEncounterTables } from '../rules/encounter-selection';
import { resolveConfig } from '../rules/config';
import { catalogOf, itemOf } from '../rules/item-catalog';
import { semanticFingerprint } from '../rules/semantic';
import { bumpStat } from '../rules/stats';
import type { GameState } from '../rules/state';
import type { Content } from '../rules/types';
import { clone } from '../rules/value';
import { worldWeatherCategory } from '../rules/world-data';
import type { EncounterTypeId, WorldDirection, WorldFact, WorldPoint } from '../rules/world-data';
import type { EncounterRuntime, WorldBusinessFacts, WorldLocalState } from '../rules/world-state';

export interface FieldMoveEventPosition extends WorldPoint { readonly eventId: number; readonly direction: WorldDirection; readonly through: boolean }
export type FieldMoveRecord = { readonly kind: 'erased-event'; readonly target: FieldMoveFacingEvent }
  | { readonly kind: 'event-position'; readonly position: FieldMoveEventPosition };
export interface FieldMoveSurfState { readonly surfBase: WorldPoint | null; readonly endingSurf: boolean }
/** Transient records belong to the parent. They are not additions to the persistent save schema. */
export interface FieldMoveParentState {
  readonly game: GameState;
  readonly local: WorldLocalState;
  readonly encounterRuntime: EncounterRuntime;
  readonly surf: FieldMoveSurfState;
  readonly records: readonly FieldMoveRecord[] | null;
}
/** Materialized joint data after every provider and parent map/lifetime check; no getters. */
export interface FieldMoveObservation extends FieldMoveParentState {
  readonly owner: object | null; readonly generation: number; readonly content: Content; readonly mapId: number;
}
type RecordStage = Extract<FieldMoveStage, { readonly kind: 'host'; readonly action: 'erase-event' | 'register-erasure' | 'record-event-position' | 'wait-event-movement' }>;
export type FieldMoveAppliedStage = Exclude<FieldMoveStage, { readonly kind: 'host' }> | RecordStage;
export type FieldMoveUpdate = { readonly stage: Exclude<FieldMoveAppliedStage, { readonly kind: 'request-encounter' }>; readonly observation?: FieldMoveRecord };
export interface FieldMoveHostOperation {
  /** Actual child closure only. Old hosts may omit this; START production must refuse missing capability. */
  recordMovementStart?(observation: unknown): MovementStartResult;
  /** Actual completed landing only; not a DTO admission route. */
  recordSurfLandingCompletion?(receipt: unknown): void;
  recordSurfLandingFailure?(receipt: unknown, reason: string): void;
  assertCurrent(): void;
  /** Synchronous recursive calls are refused before observing any provider. No ACK or cursor advance
   * occurs; a provider may catch that refusal and let the original issued stage finish once. */
  applyStage(stage: FieldMoveAppliedStage, observation?: FieldMoveRecord): { readonly status: 'completed' };
  surfRuntime(): { readonly surfing: boolean; readonly surfBase: WorldPoint | null; readonly endingSurf: boolean };
  localRecordsAvailable(): WorldFact<boolean>;
}
export type FieldMoveHostResult = { readonly status: 'completed'; readonly completedStages: number; readonly effectSuccess: true | null; readonly outcome: FieldMovePlan['outcome'] }
  | { readonly status: 'cancelled' | 'failed' | 'unavailable' | 'invalid' | 'refused' | 'not-landed'; readonly reason: string; readonly completedStages: number };
export interface FieldMoveExecutionPort {
  registerSurfLanding?(context: object, receipt: unknown): OwnedSurfLandingBound;
  takeSurfLanding?(context: object, receipt: unknown): OwnedSurfLandingBound;
  facts(): FieldMoveFacts;
  run(plan: FieldMovePlan, operation: FieldMoveHostOperation): Promise<FieldMoveHostResult>;
  pushStrength(input: { readonly strengthUsed: boolean; readonly playSound: boolean }, operation: FieldMoveHostOperation): Promise<FieldMoveHostResult>;
  landSurf(operation: FieldMoveHostOperation): Promise<FieldMoveHostResult>;
  /** The composition adapter binds this one notification's actual native player identity. */
  cleanupSurf(operation: FieldMoveHostOperation, notificationPlayer?: object): Promise<FieldMoveHostResult>;
}
export type FieldMoveAction = { readonly kind: 'use'; readonly moveId: LocalFieldMoveId; readonly entry: FieldMoveEntry; readonly memberId?: string; readonly debug?: boolean }
  | { readonly kind: 'strength-push'; readonly playSound: boolean } | { readonly kind: 'surf-land' } | { readonly kind: 'surf-cleanup' };
export interface FieldMoveEncounterFacts {
  readonly tables: FormalEncounterTables;
  readonly currentType: EncounterTypeId | null;
  readonly disabled: boolean; readonly playerPresent: boolean; readonly debugControl: boolean;
  readonly business: WorldBusinessFacts;
}
/** Data for the internal C consumer. It carries no callable capability or battle admission. */
export interface FieldMoveEncounterIntent {
  readonly source: 'rock-smash' | 'sweet-scent'; readonly type: EncounterTypeId; readonly mapId: number;
  readonly trigger: 'passed' | 'skip'; readonly allowance: 'skip'; readonly business: WorldBusinessFacts;
  readonly onBattleStartedStat?: 'rock_smash_battles';
}
export interface FieldMoveOperationOptions {
  readonly owner: object; readonly generation: number; readonly action: FieldMoveAction; readonly host: FieldMoveExecutionPort;
  observe(): FieldMoveObservation;
  /** At the last actual joint observation, call current; then pure applyFieldMoveUpdate and local atomic
   * install, with no external code until returning the actual installed parent state. Throw means no write. */
  commit(update: FieldMoveUpdate, current: (actual: FieldMoveObservation) => void): FieldMoveParentState;
  /** Internal parent seam, never a host port. It first calls current with the actual old prefix,
   * drains only its authenticated B notices, then returns the exact native post-drain observation.
   * The parent rejects unrelated state/local/runtime writes and retains owner/generation/Content/map. */
  synchronizeWorldNotices?(current: (actual: FieldMoveObservation) => void): FieldMoveObservation;
  encounterFacts?(): FieldMoveEncounterFacts;
  readonly random?: (upperExclusive: number) => number;
  /** Internal World-private writer, not a native/provider callback. */
  recordMovementStart?(context: object, observation: unknown, current: (actual: FieldMoveObservation) => void): { readonly result: MovementStartResult; readonly state: FieldMoveParentState };
  /** Supplied only by the actual completed-step parent, never by an action DTO. */
  readonly cleanupPlayer?: object;
  recordLandingCompletion?(context: object, receipt: unknown, current: (actual: FieldMoveObservation) => void, terminalOnly?: boolean): void;
}
export interface FieldMoveOperationOutcome {
  readonly status: FieldMoveHostResult['status']; readonly reason?: string; readonly completedStages: number;
  readonly committedUpdates: number; readonly effectSuccess?: true | null; readonly outcome?: FieldMovePlan['outcome'];
  readonly encounter?: FieldMoveEncounterIntent;
}
const why = (error: unknown): string => error instanceof Error ? error.message : String(error);
function frozen<T>(value: T): T {
  if (value !== null && typeof value === 'object') { for (const child of Object.values(value)) frozen(child); Object.freeze(value); }
  return value;
}
function stateOf(actual: FieldMoveParentState): FieldMoveParentState {
  return { game: actual.game, local: actual.local, encounterRuntime: actual.encounterRuntime, surf: actual.surf, records: actual.records };
}
/** Pure helper for the parent's trusted final interval. Native event observations are already checked by
 * the production host; the child additionally binds each record to its exact issued stage and map. */
export function applyFieldMoveUpdate(before: FieldMoveParentState, update: FieldMoveUpdate): FieldMoveParentState {
  const next = clone(before), stage = update.stage;
  if (stage.kind === 'commit') {
    Object.assign(next.game.world, stage.world); Object.assign(next.local, stage.local);
    for (const stat of stage.stats ?? []) next.game.stats = bumpStat(next.game.stats, stat.counter, stat.delta);
  } else if (stage.kind === 'runtime') {
    return { ...next, surf: { ...next.surf, ...('surfBase' in stage ? { surfBase: stage.surfBase } : {}), ...('endingSurf' in stage ? { endingSurf: stage.endingSurf } : {}) } };
  }
  else if (stage.kind === 'reset-encounters') { next.encounterRuntime.graceSteps = 0; next.encounterRuntime.accumulator = 0; }
  else {
    if (!update.observation) throw Error('field-move-record-missing');
    if (next.records === null) throw Error('field-move-records-unavailable');
    const record = clone(update.observation), target = record.kind === 'erased-event' ? record.target : record.position;
    const records = next.records.filter(item => {
      const p = item.kind === 'erased-event' ? item.target : item.position;
      return item.kind !== record.kind || p.mapId !== target.mapId || p.eventId !== target.eventId;
    });
    return { ...next, records: [...records, record] };
  }
  return next;
}

export class FieldMoveOperation {
  private readonly options: FieldMoveOperationOptions;
  private promise: Promise<FieldMoveOperationOutcome> | null = null;
  private cancelled = false;
  private done = false;
  private invalid: string | null = null;
  private running = false;
  private applying = false;
  private observing = false;
  private stateIdentity: string | undefined;
  private contentIdentity: string | undefined;
  private initialMapId: number | undefined;
  private updates = 0;
  private expected: readonly FieldMoveAppliedStage[] = [];
  private nextStage = 0;
  private encounter: FieldMoveEncounterIntent | undefined;
  private movementContext: FieldMoveHostOperation | null = null;
  private recordingMovement = false;
  private movementCounted = false;
  private landingRecorded = false;
  constructor(options: FieldMoveOperationOptions) { this.options = { ...options, action: frozen(clone(options.action)) }; }
  /** Pure original child membership; no host/observer or state provider runs here. */
  ownsMovementContext(context: object): boolean {
    const action = this.options.action;
    return this.movementContext === context && this.running && !this.done && !this.cancelled && this.invalid === null
      && !this.applying && !this.observing && (action.kind === 'use' && action.moveId === 'surf' && this.expected.length > 0 && this.nextStage === this.expected.length
        || action.kind === 'surf-land' && this.nextStage === 0);
  }
  private recordMovement(context: FieldMoveHostOperation, observation: unknown): MovementStartResult {
    if (!this.ownsMovementContext(context) || this.recordingMovement || !this.options.recordMovementStart) return { status: 'refused', reason: 'surf-movement-context-stale' };
    this.recordingMovement = true;
    try {
      this.current();
      const recorded = this.options.recordMovementStart(context, observation, actual => { this.check(actual); });
      if (recorded.result.status === 'counted' || recorded.result.status === 'duplicate') {
        this.stateIdentity = semanticFingerprint(recorded.state); this.movementCounted = true; this.current();
      } else this.invalid ??= recorded.result.reason;
      return recorded.result;
    } catch (error) { this.invalid ??= why(error); return { status: 'refused', reason: this.invalid }; }
    finally { this.recordingMovement = false; }
  }
  private active(): void {
    if (this.cancelled) throw Error('field-move-cancelled');
    if (this.done) throw Error('field-move-finished');
    if (this.invalid) throw Error(this.invalid);
  }
  private check(actual: FieldMoveObservation): FieldMoveObservation {
    try {
      this.active();
      if (actual.owner !== this.options.owner || actual.generation !== this.options.generation) throw Error('stale-field-move-parent');
      if (!Number.isSafeInteger(actual.mapId) || actual.mapId <= 0 || this.initialMapId !== undefined && actual.mapId !== this.initialMapId) throw Error('field-move-map-changed');
      const state = semanticFingerprint(stateOf(actual)), content = semanticFingerprint(actual.content);
      if (this.stateIdentity !== undefined && state !== this.stateIdentity) throw Error('field-move-state-changed');
      if (this.contentIdentity !== undefined && content !== this.contentIdentity) throw Error('field-move-content-changed');
      this.initialMapId = actual.mapId; this.stateIdentity = state; this.contentIdentity = content;
      return actual;
    } catch (error) { this.invalid ??= why(error); throw error; }
  }
  private current(): FieldMoveObservation {
    this.active();
    if (this.observing) throw Error('field-move-reentrant-observation');
    this.observing = true;
    try { return this.check(this.options.observe()); }
    finally { this.observing = false; }
  }
  run(): Promise<FieldMoveOperationOutcome> {
    if (!this.promise) this.promise = Promise.resolve().then(() => this.execute());
    return this.promise;
  }
  cancel(): Promise<FieldMoveOperationOutcome> { if (!this.done) this.cancelled = true; return this.run(); }
  private commit(update: FieldMoveUpdate): void {
    this.current();
    const next = this.options.commit(frozen(clone(update)), actual => { this.check(actual); });
    this.stateIdentity = semanticFingerprint(stateOf(next)); this.updates++;
    this.current();
  }
  private authorize(stage: FieldMoveAppliedStage): void {
    if (!this.running) throw Error('field-move-stage-outside-execution');
    semanticFingerprint(stage);
    const action = this.options.action;
    if (action.kind === 'use') {
      if (this.nextStage >= this.expected.length || semanticFingerprint(stage) !== semanticFingerprint(this.expected[this.nextStage])) throw Error('field-move-unissued-stage');
    } else if (action.kind === 'strength-push') {
      if (this.nextStage === 0) {
        if (semanticFingerprint(stage) !== semanticFingerprint({ kind: 'commit', stats: [{ counter: 'strength_push_count', delta: 1 }] })) throw Error('field-move-unissued-stage');
      } else if (this.nextStage !== 1 || stage.kind !== 'host' || stage.action !== 'record-event-position') throw Error('field-move-unissued-stage');
    } else if (action.kind === 'surf-land') {
      if (this.nextStage !== 0 || stage.kind !== 'runtime' || stage.endingSurf !== true || !stage.surfBase) throw Error('field-move-unissued-stage');
    } else if (this.nextStage >= this.expected.length || semanticFingerprint(stage) !== semanticFingerprint(this.expected[this.nextStage])) throw Error('field-move-unissued-stage');
  }
  private apply(stage: FieldMoveAppliedStage, observation?: FieldMoveRecord): { readonly status: 'completed' } {
    this.active();
    if (!this.running || this.applying || this.observing) throw Error('field-move-stage-outside-execution');
    // Reserve the whole issued stage before the first observation. This also covers encounter facts,
    // RNG and post-install observations; only its original invocation can consume the cursor.
    this.applying = true;
    try {
      this.authorize(stage); this.current();
      if (stage.kind === 'request-encounter') this.requestEncounter(stage);
      else {
        if (stage.kind === 'host') {
          if (stage.action === 'register-erasure') {
            if (!observation || observation.kind !== 'erased-event' || semanticFingerprint(observation.target) !== semanticFingerprint(stage.target)) throw Error('field-move-erasure-mismatch');
          } else if (stage.action === 'record-event-position') {
            if (!observation || observation.kind !== 'event-position' || observation.position.mapId !== this.initialMapId || observation.position.eventId !== stage.target.eventId) throw Error('field-move-position-mismatch');
          } else throw Error('field-move-record-stage-unsupported');
        } else if (observation) throw Error('field-move-unexpected-record');
        this.commit({ stage, ...(observation ? { observation } : {}) });
      }
      this.nextStage++;
      return { status: 'completed' };
    } finally {
      this.applying = false;
    }
  }
  private requestEncounter(stage: Extract<FieldMoveStage, { readonly kind: 'request-encounter' }>): void {
    if (!this.options.encounterFacts) throw Error('field-move-encounter-facts-unavailable');
    if (this.options.synchronizeWorldNotices) {
      const actual = this.options.synchronizeWorldNotices(before => { this.check(before); });
      this.active();
      if (actual.owner !== this.options.owner || actual.generation !== this.options.generation || actual.mapId !== this.initialMapId
        || semanticFingerprint(actual.content) !== this.contentIdentity) throw Error('stale-field-move-notice-sync');
      this.stateIdentity = semanticFingerprint(stateOf(actual));
      this.check(actual);
    }
    if (stage.source === 'sweet-scent' && this.current().game.world.weather.type !== 'None') return;
    const raw = this.options.encounterFacts(); this.current(); semanticFingerprint(raw);
    const facts = clone(raw), actual = this.current(), business = facts.business;
    if (business.mapId.status !== 'value' || business.mapId.value !== actual.mapId) throw Error('field-move-encounter-map-changed');
    if (![facts.disabled, facts.playerPresent, facts.debugControl].every(value => typeof value === 'boolean')) throw Error('field-move-invalid-encounter-gates');
    const type = stage.type === 'current' ? facts.currentType : stage.type;
    if (type === null) return;
    if (!isEncounterType(type)) throw Error('field-move-invalid-encounter-type');
    if (stage.source === 'rock-smash') {
      if (business.cycling.status !== 'value' || typeof business.cycling.value !== 'boolean') throw Error('field-move-cycling-unavailable');
      const config = resolveConfig(actual.content.settings);
      const trigger = checkRockSmashTrigger({ table: Object.hasOwn(facts.tables, type) ? facts.tables[type] : undefined,
        runtime: actual.encounterRuntime, local: actual.local, party: actual.game.party.map(member => ({ ...member, item: itemOf(catalogOf(actual.content), member.item)?.battleId ?? member.item })),
        weatherCategory: worldWeatherCategory(actual.game.world.weather.type), moreAbilities: config.MORE_ABILITIES_AFFECT_WILD_ENCOUNTERS,
        disabled: facts.disabled, playerPresent: facts.playerPresent, debugControl: facts.debugControl, cycling: business.cycling.value }, upper => {
        this.current(); if (!this.options.random) throw Error('field-move-random-unavailable');
        const value = this.options.random(upper); this.current(); return value;
      });
      if (!trigger.triggered) return;
    } else if (!Object.hasOwn(facts.tables, type) || !facts.tables[type]?.slots.length) return;
    this.current();
    // World authority always comes from the actual parent, never a host projection.
    business.weather = { status: 'value', value: { ...clone(actual.game.world.weather), category: worldWeatherCategory(actual.game.world.weather.type) } };
    business.surfing = { status: 'value', value: actual.game.world.surfing };
    this.encounter = frozen({ source: stage.source, type, mapId: actual.mapId, trigger: stage.source === 'rock-smash' ? 'passed' : 'skip', allowance: 'skip', business,
      ...(stage.source === 'rock-smash' ? { onBattleStartedStat: 'rock_smash_battles' as const } : {}) });
  }
  private async execute(): Promise<FieldMoveOperationOutcome> {
    let result: FieldMoveHostResult;
    try {
      const actual = this.current(), action = this.options.action;
      const consumer = this;
      const operation: FieldMoveHostOperation = {
        recordMovementStart: function(this: unknown, observation) { return this === operation ? consumer.recordMovement(operation, observation) : { status: 'refused', reason: 'surf-movement-context-borrowed' }; },
        recordSurfLandingCompletion: function(this: unknown, receipt) {
          if (this !== operation || consumer.options.action.kind !== 'surf-land' || !consumer.running || consumer.done || consumer.cancelled
            || consumer.invalid !== null || consumer.applying || consumer.observing || consumer.recordingMovement || !consumer.movementCounted
            || consumer.nextStage !== 1 || consumer.landingRecorded || !consumer.options.recordLandingCompletion) throw Error('surf-landing-completion-unissued');
          consumer.current(); consumer.landingRecorded = true;
          consumer.options.recordLandingCompletion(operation, receipt, actual => { consumer.check(actual); });
          consumer.current();
        },
        recordSurfLandingFailure: function(this: unknown, receipt, reason) {
          if (this !== operation || consumer.options.action.kind !== 'surf-land' || !consumer.running || consumer.done
            || consumer.applying || consumer.observing || consumer.recordingMovement || consumer.landingRecorded || typeof reason !== 'string'
            || !consumer.options.recordLandingCompletion) throw Error('surf-landing-terminal-unissued');
          consumer.invalid ??= reason; consumer.landingRecorded = true;
          consumer.options.recordLandingCompletion(operation, receipt, () => {}, true);
        },
        assertCurrent: () => { this.current(); }, applyStage: (stage, observation) => this.apply(stage, observation),
        surfRuntime: () => { const a = this.current(); return { surfing: a.game.world.surfing, ...clone(a.surf) }; },
        localRecordsAvailable: () => ({ status: 'value', value: this.current().records !== null }),
      };
      this.movementContext = operation;
      let plan: FieldMovePlan | undefined;
      if (action.kind === 'use') {
        const facts = this.options.host.facts(); this.current();
        const planned = planFieldMove({ moveId: action.moveId, entry: action.entry, ...(action.memberId !== undefined ? { memberId: action.memberId } : {}),
          context: { party: actual.game.party, badges: actual.game.badges, content: actual.content, debug: action.debug, world: actual.game.world, local: actual.local, facts } });
        if (planned.status !== 'planned') return frozen({ ...planned, completedStages: 0, committedUpdates: this.updates });
        plan = frozen(clone(planned));
        this.expected = plan.steps.filter((stage): stage is FieldMoveAppliedStage => stage.kind !== 'host' || stage.action === 'register-erasure');
      } else if (action.kind === 'surf-cleanup') {
        this.expected = actual.surf.surfBase === null ? [] : [{ kind: 'runtime', surfBase: null }, ...(actual.surf.endingSurf ? [
          { kind: 'commit', world: { surfing: false } }, { kind: 'reset-encounters', reason: 'surf-end' }, { kind: 'runtime', endingSurf: false },
        ] as const : [])];
      }
      if (action.kind === 'surf-land' && actual.surf.endingSurf) return frozen({ status: 'refused', reason: 'surf-ending-active', completedStages: 0, committedUpdates: this.updates });
      this.running = true;
      if (action.kind === 'use') result = await this.options.host.run(plan!, operation);
      else if (action.kind === 'strength-push') result = await this.options.host.pushStrength({ strengthUsed: actual.local.strengthUsed, playSound: action.playSound }, operation);
      else if (action.kind === 'surf-land') result = await this.options.host.landSurf(operation);
      else result = await this.options.host.cleanupSurf(operation, this.options.cleanupPlayer);
      this.current(); semanticFingerprint(result);
      // A production parent with the real START writer cannot accept an acknowledged Surf
      // jump while its distance proof was omitted/refused. Pure leaf-only legacy hosts do
      // not install this internal consumer and retain their existing contract.
      if (this.options.recordMovementStart && result.status === 'completed' && !this.movementCounted
        && (action.kind === 'surf-land' || action.kind === 'use' && action.moveId === 'surf'
          && plan?.steps.some(stage => stage.kind === 'host' && stage.action === 'jump-forward'))) throw Error('surf-movement-start-not-recorded');
      if (!['completed', 'cancelled', 'failed', 'unavailable', 'invalid', 'refused', 'not-landed'].includes(result.status)
        || !Number.isSafeInteger(result.completedStages) || result.completedStages < 0
        || (result.status === 'completed' ? ![true, null].includes(result.effectSuccess) || !['effect', 'weather-blocked'].includes(result.outcome) : typeof result.reason !== 'string')) throw Error('field-move-invalid-host-result');
      if (result.status === 'completed' && (action.kind === 'use' || action.kind === 'surf-cleanup' && this.options.cleanupPlayer !== undefined) && this.nextStage !== this.expected.length) throw Error('field-move-incomplete-host-stages');
      // Host output is presentation acknowledgement data. Extra encounter/admission fields cannot issue a producer intent.
      const acknowledged: FieldMoveHostResult = result.status === 'completed'
        ? { status: result.status, completedStages: result.completedStages, effectSuccess: result.effectSuccess, outcome: result.outcome }
        : { status: result.status, completedStages: result.completedStages, reason: result.reason };
      return frozen({ ...acknowledged, committedUpdates: this.updates, ...(result.status === 'completed' && this.encounter ? { encounter: this.encounter } : {}) });
    } catch (error) {
      return frozen({ status: this.cancelled ? 'cancelled' : 'failed', reason: why(error), completedStages: 0, committedUpdates: this.updates });
    } finally { this.running = false; this.done = true; }
  }
}
