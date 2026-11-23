import type { OwnedSurfLandingBound, OwnedSurfLandingStepScope } from './surf-landing-ports';
import type { PreparedMovementStart } from './movement-start-application';
import { shortcutRecoverySnapshot } from './field-shortcut-recovery';
import type { FieldShortcutRecoverySnapshot } from './field-shortcut-recovery';
import { BlackoutApplication } from './blackout-application';
const blackoutFieldAdmission = BlackoutApplication.prototype.hasFieldAdmission;
import type { BlackoutRunResult } from './blackout-operation';
import type { WorldBlackoutHost } from './blackout-ports';
/** World writes and the single owner of an inventory-to-map field item handoff. */
import { clone } from '../rules/value';
import { semanticFingerprint } from '../rules/semantic';
import { catalogOf, consumesItem, itemOf } from '../rules/item-catalog';
import { classifyFieldItem } from '../rules/field-items';
import type { NoTargetFieldItemAction } from '../rules/field-items';
import { itemQuantity, removeItems } from '../rules/inventory';
import { planItemUse } from '../rules/item-effects';
import { validateGameContent } from '../rules/save-schema';
import { selectOrdinaryEncounterType } from '../rules/encounter-selection';
import type { EncounterTypeId } from '../rules/world-data';
import { FieldMoveOperation, applyFieldMoveUpdate } from './field-move-operation';
const ownsFieldMovement = FieldMoveOperation.prototype.ownsMovementContext;
import type { FieldMoveAction, FieldMoveExecutionPort, FieldMoveObservation, FieldMoveOperationOutcome, FieldMoveParentState, FieldMoveRecord, FieldMoveSurfState, FieldMoveEncounterIntent } from './field-move-operation';
import type { FieldShortcutSelection } from './field-shortcut-query';
import type { FieldShortcutAdmission } from './ports';
import { bumpStat } from '../rules/stats';
import { resolveConfig } from '../rules/config';
import { newWorldLocalState, newEncounterRuntime, worldWeatherProblems } from '../rules/world-state';
import type { WorldBusinessFacts, HostWorldFacts, WorldFact, WorldMapEntry, EncounterRuntime, WorldLocalState } from '../rules/world-state';
import { worldWeatherCategory } from '../rules/world-data';
import type { WorldWeatherIntent } from '../rules/world-data';
import type { GameState } from '../rules/state';
import type { Content, DexLookup } from '../rules/types';
import type { InventorySession, InventoryTicket } from './inventory-session';
import type { AtomicStateResult, AtomicFieldQueryState, RandomPort, WorldHostLifecycle } from './ports';
import { FishingOperation } from './fishing-operation';
import type { FishingObservation, FishingOperationFacts, FishingOperationOutcome, FishingPresentationPort, FishingStat, FishingEncounterIntent } from './fishing-operation';
import type { CompletedWorldStep, CompletedStepHostPort, CompletedWorldStepOutcome, CompletedStepPermit, OwnedRepelSelection, OrdinaryEncounterHostPort, WorldBattleOffer, WorldBattleAdmission, WorldBattleParentPermit, FieldBattlePermit, FieldMoveBattlePermit, FieldEncounterHostPort } from './ports';
import { CompletedStepOperation, sameCompletedStep } from './completed-step-operation';
import type { CompletedStepHandlerState } from './completed-step-operation';
import { prepareOrdinaryEncounter, prepareFieldEncounter, findWorldEncounterTables } from './encounter-operation';
import type { PreparedWorldEncounter } from './encounter-operation';
import { planInitialWildRegistration } from './encounter-operation';
import type { FormalEncounterTables } from '../rules/encounter-selection';
import { WorldTravelApplication } from './world-travel-application';
import type { WorldTravelHost, TravelAtomicPort, WorldTravelRequest, WorldTravelStepFacts, PreparedTravelEntry, WorldTravelOutcome } from './world-travel-application';
import type { TravelCheckpoint, TravelReceipt } from './world-travel-operation';

export type WorldOperationOutcome = { status: 'committed' | 'unchanged' | 'duplicate' | 'queued'; diagnostics?: string[] } | { status: 'refused'; reason: string };
export type FieldBlackoutCheckOutcome = BlackoutRunResult | { status: 'not-required' } | { status: 'refused'; reason: string };
export interface WorldNoticeReceipt {
  readonly sequence: number; readonly kind: 'map-entry' | 'weather-command';
  readonly weather: Readonly<WorldWeatherIntent>; readonly weatherChanged: boolean;
  readonly entryId?: string; readonly mapId?: number;
  readonly diagnostics?: readonly string[];
}
export interface WorldNoticeFlushOutcome {
  readonly status: 'drained' | 'pending' | 'refused'; readonly receipts: readonly WorldNoticeReceipt[];
  readonly pending: number; readonly reason?: string;
}
type WeatherDraw = { status: 'value'; value: number } | { status: 'failed'; reason: string };
type Notice = { sequence: number; generation: number; contentIdentity: string; status: 'capturing' | 'ready' | 'applying'; invalid?: string } & (
  { kind: 'map-entry'; entry: WorldMapEntry; identity: string; metadata: WorldBusinessFacts['mapMetadata'] | null; weatherDraw?: WeatherDraw }
  | { kind: 'weather-command'; intent: WorldWeatherIntent });
export interface FieldItemHandoff {
  token: string; generation: number; requestId: string; itemId: string;
  entry: 'bag' | 'shortcut'; action: NoTargetFieldItemAction;
}
export type FieldItemHandoffOutcome = { status: 'handoff'; handoff: Readonly<FieldItemHandoff> } | { status: 'refused'; reason: string } | { status: 'cancelled' };
export type FieldItemRunOutcome = ({ status: 'completed' | 'duplicate'; itemId: string; consumed: boolean } | { status: 'travel-admitted'; itemId: string; consumed: false; readonly travel: WorldTravelOutcome } | { status: 'battle-admitted'; itemId: string; consumed: boolean; admission: WorldBattleAdmission } | { status: 'cancelled' } | { status: 'refused' | 'failed'; reason: string }) & { readonly fishing?: FishingOperationOutcome; readonly fieldMove?: FieldMoveOperationOutcome };
export interface FishingWorldPort {
  readonly presentation: FishingPresentationPort;
  facts(): Omit<FishingOperationFacts, 'business'>;
}
export interface WorldAtomicObservation { readonly game: GameState; readonly content: Content; readonly generation: number; readonly lifecycle: WorldHostLifecycle }
export interface WorldAtomicPort {
  <T>(prepare: () => (actual: WorldAtomicObservation) => AtomicStateResult<T>): T;
}
export interface FieldItemExecutionRequest {
  readonly owner: Readonly<{ token: string; generation: number }>;
  readonly itemId: string; readonly action: NoTargetFieldItemAction;
  readonly entry: 'bag' | 'shortcut'; readonly initialMapId: number;
  assertCurrent(): void;
}
export type FieldItemExecutionResult = { status: 'completed' } | { status: 'cancelled' } | { status: 'refused' | 'failed'; reason: string };
export interface FieldItemExecutionPort { execute(request: FieldItemExecutionRequest): Promise<FieldItemExecutionResult> }
interface Options {
  projectionReset?(): void; projectionRestore?(): boolean;
  /** Actual App-private consumer; no native/provider callback is accepted here. */
  prepareMovement?(actual: AtomicFieldQueryState & { readonly generation: number }, observation: unknown, context: object): PreparedMovementStart;
  movementInstalled?(prepared: PreparedMovementStart, game: GameState): void;
  companionsTransferred?(hidden: readonly string[]): void;
  read(): GameState; install(next: GameState, current: (content: Content) => void): void; content(): Content; generation(): number;
  canStart(): boolean; canStartCompletedStep?(): boolean; canChangeWeather(): boolean; inventory: InventorySession; random?: RandomPort;
  switchOn(id: number): boolean;
  host?: { read(): HostWorldFacts }; fieldItems?: FieldItemExecutionPort; completedSteps?: CompletedStepHostPort;
  travel?: WorldTravelHost; travelAtomic?: TravelAtomicPort; blackout?: WorldBlackoutHost; blackoutAtomic?: TravelAtomicPort;
  atomic?: WorldAtomicPort; lifecycle?(): WorldHostLifecycle; fishing?: FishingWorldPort; fieldMoves?: FieldMoveExecutionPort; fieldEncounters?: FieldEncounterHostPort;
  ordinaryEncounters?: OrdinaryEncounterHostPort; contentView(): { content: Content; dex?: DexLookup }; now(): number; allowHeldItemSources: boolean;
  admit(parent: WorldBattleParentPermit, offer: WorldBattleOffer): WorldBattleAdmission;
  /** Trusted App request registry. An equal token/selection DTO is not an issued request. */
  shortcutSelection?(request: object, admitting: boolean): FieldShortcutSelection | null;
  shortcutAdmission?(request: object): FieldShortcutAdmission | null;
  shortcutRecovery?(request: object): { readonly kind: 'move' } | { readonly kind: 'item'; readonly itemToken: string } | null;
}
interface ShortcutOwner extends FieldShortcutAdmission { readonly request: object }
interface HandoffOwner {
  kind: 'field-item';
  permit: FieldBattlePermit; admitted: boolean;
  inventoryToken: string;
  handoff: FieldItemHandoff; mapId: number; contentIdentity: string; inventoryIdentity: string;
  running: boolean; cancelled: boolean; promise?: Promise<FieldItemRunOutcome>;
  fishing?: FishingOperation;
  lifecycle?: WorldHostLifecycle;
  move?: FieldMoveOperation;
  consumed?: boolean;
  travelAdmitted?: boolean;
  shortcut?: ShortcutOwner;
}
interface FieldMoveOwner {
  readonly kind: 'field-move'; readonly permit: FieldMoveBattlePermit; readonly requestId: string;
  readonly mapId: number; readonly contentIdentity: string; inventoryIdentity: string;
  running: boolean; cancelled: boolean; admitted: boolean; lifecycle?: WorldHostLifecycle; move?: FieldMoveOperation;
  promise?: Promise<FieldMoveRunOutcome>;
  readonly shortcut?: ShortcutOwner;
  shortcutMovementReleased?: boolean;
  landing?: { readonly context: object; readonly receipt: unknown; readonly bound: OwnedSurfLandingBound; readonly terminalOnly: boolean };
  terminalArrival?: { readonly ticket: object; readonly entry: object; readonly child: FieldMoveOperation };
}
type FieldOwner = HandoffOwner | FieldMoveOwner;
interface FieldTravelRetry { readonly promise: Promise<FieldItemRunOutcome>; owner: object | null }
export type FieldMoveRunOutcome = FieldMoveOperationOutcome & { readonly admission?: WorldBattleAdmission };
interface NativeFieldObservation extends FishingObservation { readonly lifecycle: WorldHostLifecycle }
interface NoticeSynchronization { before(actual: GameState): void; applied(next: GameState): void; install?(next: GameState, current: () => void, content: Content): void }
const why = (e: unknown): string => e instanceof Error ? e.message : String(e);
const unavailable = <T>(): WorldFact<T> => ({ status: 'unavailable', reason: 'world-provider-unavailable' });
function checkedFact<T>(raw: WorldFact<T>, valid: (v: unknown) => v is T): WorldFact<T> {
  if (!raw || typeof raw !== 'object') return { status: 'invalid', reason: 'invalid-world-fact' };
  if (raw.status === 'value') return valid(raw.value) ? { status: 'value', value: raw.value } : { status: 'invalid', reason: 'invalid-world-fact-value' };
  if (raw.status === 'absent' || raw.status === 'invalid' || raw.status === 'unavailable') return clone(raw);
  return { status: 'invalid', reason: 'invalid-world-fact-status' };
}
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
const boolean = (v: unknown): v is boolean => typeof v === 'boolean';

export class WorldOperation {
  private readonly options: Options;
  readonly travel: WorldTravelApplication;
  readonly blackout: BlackoutApplication;
  private readonly travelNativeEntries: WorldMapEntry[] = [];
  private readonly travelWeather = new Map<string, WeatherDraw>();
  private readonly shortcutTravels = new WeakMap<object, string>();
  private readonly fieldTravels = new Map<string, { readonly id: string; readonly itemId: string; readonly generation: number; readonly consumable: boolean;
    retry?: FieldTravelRetry }>();
  private owner: FieldOwner | CompletedStepOperation | null = null;
  private starting: object | null = null;
  private sequence = 0;
  private entries = new Map<string, string>();
  private requests = new Map<string, { fingerprint: string; handoff: FieldItemHandoff }>();
  private receipts = new Map<string, FieldItemRunOutcome>();
  private noticeSequence = 0;
  private readonly notices: Notice[] = [];
  private readonly observations = new Map<string, Notice>();
  private readonly noticeReceipts: WorldNoticeReceipt[] = [];
  private readonly stepReceipts = new Map<string, { step: CompletedWorldStep; outcome: CompletedWorldStepOutcome }>();
  private readonly fieldChecks = new Map<string, Promise<FieldBlackoutCheckOutcome>>();
  private readonly offers = new WeakMap<WorldBattleOffer, { operation: CompletedStepOperation | FieldOwner; prepared: PreparedWorldEncounter; taken: boolean }>();
  private readonly fishingIntents = new WeakMap<FishingEncounterIntent, { owner: HandoffOwner; outcome: FishingOperationOutcome; taken: boolean }>();
  private readonly moveIntents = new WeakMap<FieldMoveEncounterIntent, { owner: FieldOwner; outcome: FieldMoveOperationOutcome; taken: boolean }>();
  private readonly moveRequests = new Map<string, { identity: string; owner: FieldMoveOwner }>();
  private readonly shortcutMoves = new WeakMap<object, { identity: string; owner: FieldMoveOwner }>();
  private readonly landingParents = new WeakMap<CompletedStepOperation, FieldMoveOwner>();
  private surf: FieldMoveSurfState = { surfBase: null, endingSurf: false };
  private records: readonly FieldMoveRecord[] = [];
  private tables: FormalEncounterTables | null = null;
  private local = newWorldLocalState();
  private runtime = newEncounterRuntime();
  constructor(options: Options) {
    this.options = options;
    this.travel = new WorldTravelApplication({ host: options.travel, atomic: options.travelAtomic, generation: options.generation,
      canStart: parent => (!this.owner ? this.canStartBusiness() : this.owner === parent && this.owner.kind === 'field-item' && this.owner.running && !this.owner.cancelled && options.canStartCompletedStep?.() === true)
        && !this.starting && this.notices.length === 0 && !options.inventory.active,
      canRecover: () => !this.recoveryPending && !this.owner && !this.starting && this.notices.length === 0 && !this.blackout.active && options.canStartCompletedStep?.() === true && !options.inventory.active,
      source: () => { if (!options.travelAtomic) throw Error('travel-native-lifecycle-unavailable'); return options.travelAtomic(() => actual => ({ value: actual.lifecycle })); },
      prepareEntry: (checkpoint, game, content, current) => this.prepareTravelEntry(checkpoint, game, content, current),
      completeConnection: (owner, receipt, facts) => this.completeConnection(owner, receipt, facts),
      shortcutAdmission: options.shortcutAdmission, prepareMovement: options.prepareMovement, movementInstalled: options.movementInstalled, companionsTransferred: options.companionsTransferred,
      toolAdmission: (parent, actual) => this.toolAdmission(parent, actual),
      toolInstalled: parent => {
        if (this.owner !== parent || this.owner.kind !== 'field-item' || this.owner.cancelled) throw Error('travel-tool-parent-stale');
        this.owner.travelAdmitted = true; this.owner = null;
      },
      toolCompleted: (id, consumed) => {
        for (const [token, record] of this.fieldTravels) if (record.id === id && record.generation === options.generation()) {
          this.remember(token, { status: 'completed', itemId: record.itemId, consumed }); break;
        }
      },
      released: () => { this.flushNotices(false); },
    });
    this.blackout = new BlackoutApplication({ projectionReset: options.projectionReset, projectionRestore: options.projectionRestore, host: options.blackout, travel: options.travel, atomic: options.blackoutAtomic, generation: options.generation,
      prepareEntry: (checkpoint, game, content, current) => this.prepareTravelEntry(checkpoint, game, content, current),
      sourceEntries: sync => { const result = this.drainNotices(false, null, false, sync); if (result.status !== 'drained') throw Error(result.status === 'refused' ? result.reason : 'blackout-source-notice-pending'); },
      released: () => { this.flushNotices(false); },
    });
  }
  private toolAdmission(parent: object, actual: AtomicFieldQueryState): { readonly itemId: string } | null {
    const owner = this.owner;
    if (owner !== parent || owner.kind !== 'field-item' || owner.cancelled || !owner.running || owner.permit.generation !== this.options.generation() || owner.handoff.action.kind !== 'escape-rope' || this.options.inventory.active) return null;
    const initial = owner.lifecycle, life = actual.lifecycle;
    if (!initial || !life.playerPosition || !initial.playerPosition || life.map !== initial.map || life.mapId !== owner.mapId || life.player !== initial.player || life.scene !== initial.scene || life.playerPosition.x !== initial.playerPosition.x || life.playerPosition.y !== initial.playerPosition.y) return null;
    if (semanticFingerprint(actual.content) !== owner.contentIdentity || semanticFingerprint(actual.game.inventory.pockets) !== owner.inventoryIdentity) return null;
    const catalog = catalogOf(actual.content), item = itemOf(catalog, owner.handoff.itemId);
    if (!item || classifyFieldItem(item)?.kind !== 'escape-rope' || itemQuantity(actual.game.inventory, item.id, catalog) < 1) return null;
    if (owner.shortcut) {
      const source = owner.shortcut.source;
      if (this.options.shortcutSelection?.(owner.shortcut.request, false) !== owner.shortcut.selection || !actual.game.inventory.registeredItems.includes(item.id)
        || source.map !== life.map || source.player !== life.player || source.mapId !== life.mapId || source.x !== life.playerPosition.x || source.y !== life.playerPosition.y || source.generation !== this.options.generation()) return null;
    }
    return { itemId: item.id };
  }
  private prepareTravelEntry(checkpoint: TravelCheckpoint, before: GameState, content: Content, current: () => void): PreparedTravelEntry {
    if (checkpoint.source.mapId === checkpoint.target.mapId) return { apply: game => game, installed: () => {} };
    const entry: WorldMapEntry = { id: `world-travel:${this.options.generation()}:${checkpoint.id}`, cause: checkpoint.kind === 'connection' ? 'connection' : 'transfer',
      previousMapId: checkpoint.source.mapId, mapId: checkpoint.target.mapId, rebuilt: true };
    const maps = content.mapMetadata?.maps;
    const metadata: WorldBusinessFacts['mapMetadata'] = maps ? Object.hasOwn(maps, String(entry.mapId)) ? { status: 'value', value: clone(maps[String(entry.mapId)]!) } : { status: 'absent' } : { status: 'unavailable' };
    const notice: Extract<Notice, { kind: 'map-entry' }> = { kind: 'map-entry', sequence: ++this.noticeSequence, generation: this.options.generation(), contentIdentity: semanticFingerprint(content), status: 'ready',
      entry, identity: semanticFingerprint(entry), metadata, ...(this.travelWeather.has(entry.id) ? { weatherDraw: this.travelWeather.get(entry.id)! } : {}) };
    let planned: ReturnType<WorldOperation['planEntry']>;
    try { planned = this.planEntry(before, entry, metadata, current, notice); }
    finally { if (notice.weatherDraw) this.travelWeather.set(entry.id, notice.weatherDraw); }
    const initialWeather = before.world.weather.type;
    return {
      apply: game => { const next = clone(game); for (const key of ['visitedMaps', 'healingSpot', 'flashUsed', 'weather'] as const) Object.assign(next.world, { [key]: clone(planned.next.world[key]) }); return next; },
      installed: game => {
        this.appliedEntry(entry, notice.identity, game); this.travelWeather.delete(entry.id);
        this.travelNativeEntries.splice(0, this.travelNativeEntries.length, entry);
        this.noticeReceipts.push(Object.freeze({ sequence: notice.sequence, kind: 'map-entry', weather: Object.freeze(clone(game.world.weather)),
          weatherChanged: initialWeather !== game.world.weather.type, entryId: entry.id, mapId: entry.mapId, ...(planned.diagnostics.length ? { diagnostics: Object.freeze([...planned.diagnostics]) } : {}) }));
      },
    };
  }
  private completeConnection(owner: object, receipt: TravelReceipt, facts: WorldTravelStepFacts): Promise<CompletedWorldStepOutcome> {
    const id = this.travel.connectionStepId(owner, receipt), host = this.options.completedSteps;
    if (!id || !host) return Promise.resolve({ status: 'failed', reason: 'connection-completed-step-host-unavailable', prefix: { stepCommitted: false, repelRenewed: false, poisonMembersCommitted: 0, repelActiveAtStart: false } });
    const actual = host.current();
    if (actual.generation !== this.options.generation() || actual.mapId !== receipt.target.mapId || actual.x !== receipt.target.x || actual.y !== receipt.target.y || this.travel.connectionStepId(owner, receipt) !== id) return Promise.resolve({ status: 'failed', reason: 'connection-completed-step-source-changed', prefix: { stepCommitted: false, repelRenewed: false, poisonMembersCommitted: 0, repelActiveAtStart: false } });
    return this.completeStep({ ...actual, ...facts, id }, { owner, receipt });
  }
  runTravel(requestId: string, request: WorldTravelRequest) { this.flushNotices(false); return this.travel.run(requestId, request); }
  runShortcutTravel(request: object, kind: 'fly' | 'dig' | 'teleport', memberId: string, selection: import('../rules/region-map').FlyDestination | null) {
    const issued = this.options.shortcutAdmission?.(request);
    if (!issued || issued.selection.kind !== 'move' || issued.selection.moveId !== kind || issued.selection.memberId !== memberId) return Promise.resolve({ status: 'failed' as const, reason: 'travel-shortcut-admission-stale' });
    const id = `shortcut-travel:${this.options.generation()}:${++this.sequence}`;
    this.shortcutTravels.set(request, id);
    return this.travel.run(id, { kind, memberId, ...(kind === 'fly' ? { selection } : {}) }, request);
  }
  private recoveryTravel(request: object, association: ReturnType<NonNullable<Options['shortcutRecovery']>> | undefined): { readonly id: string; readonly token?: string } | null {
    if (association?.kind === 'move') { const id = this.shortcutTravels.get(request); return id ? { id } : null; }
    if (association?.kind === 'item') { const record = this.fieldTravels.get(association.itemToken); return record?.generation === this.options.generation() ? { id: record.id, token: association.itemToken } : null; }
    return null;
  }
  shortcutTravelRecovery(request: object): FieldShortcutRecoverySnapshot {
    const generation = this.options.generation(), association = this.options.shortcutRecovery?.(request);
    const actual = this.recoveryTravel(request, association);
    if (actual) return this.travel.recovery(actual.id);
    // A real ordinary fishing receipt is terminal, but never owns a travel-retry capability.
    // The issued shortcut association, registered handoff and actual child receipt must agree;
    // an unavailable DTO (unknown/stale/failed request) alone does not establish this fact.
    if (generation === this.options.generation() && association?.kind === 'item' && !this.fieldTravels.has(association.itemToken)) {
      const receipt = this.receipts.get(association.itemToken);
      const handoff = [...this.requests.values()].find(record => record.handoff.token === association.itemToken)?.handoff;
      if (handoff?.generation === generation && handoff.entry === 'shortcut' && handoff.action.kind === 'fishing'
        && receipt && (receipt.status === 'completed' || receipt.status === 'duplicate' || receipt.status === 'cancelled')
        && receipt.fishing?.cleanup === 'completed' && (receipt.fishing.status === 'completed' || receipt.fishing.status === 'cancelled')) {
        return shortcutRecoverySnapshot(receipt.status === 'cancelled' ? 'cancelled' : 'completed');
      }
    }
    return shortcutRecoverySnapshot('unavailable', 'unavailable', 'unavailable', 'request-unavailable', false, false, 'request-unavailable');
  }
  async recoverShortcutTravel(request: object, action: 'retry' | 'cancel', onRetired?: (current: () => boolean) => void): Promise<WorldTravelOutcome | FieldItemRunOutcome> {
    const generation = this.options.generation();
    const actual = this.recoveryTravel(request, this.options.shortcutRecovery?.(request));
    if (!actual) return { status: 'failed', reason: 'stale-field-shortcut' };
    if (action === 'retry') {
      const associated = (): boolean => {
        const current = this.recoveryTravel(request, this.options.shortcutRecovery?.(request));
        return generation === this.options.generation() && current?.id === actual.id && current.token === actual.token;
      };
      const retired = (current: () => boolean): void => onRetired?.(() => associated() && current() && associated());
      if (actual.token) return this.retryFieldTravel(actual.token, retired);
      let owner: object | null = null;
      return this.travel.retry(actual.id, issued => { owner = issued; }, current => retired(() => !!owner && current(actual.id, owner)));
    }
    const result = this.travel.cancelFailed(actual.id);
    if (result.status === 'cancelled' && actual.token) {
      const record = this.fieldTravels.get(actual.token), receipt = this.receipts.get(actual.token);
      if (record?.id === actual.id && record.generation === this.options.generation() && receipt?.status !== 'completed' && receipt?.status !== 'duplicate' && receipt?.status !== 'cancelled') this.remember(actual.token, { status: 'cancelled' });
    }
    return result;
  }
  cancelShortcutTravel(request: object): void { const id = this.shortcutTravels.get(request); if (id) this.travel.cancel(id); }
  private get recoveryPending(): boolean { return this.options.read().world.pendingReturn !== null; }
  private canStartBusiness(): boolean { return !this.recoveryPending && this.options.canStart(); }
  get active(): boolean { return this.owner !== null || this.starting !== null || this.notices.length > 0 || this.travel.active || this.blackout.active; }
  get localState(): Readonly<WorldLocalState> { return clone(this.local); }
  get encounterRuntime(): Readonly<EncounterRuntime> { return clone(this.runtime); }
  get fieldRuntime(): Readonly<FieldMoveSurfState> { return clone(this.surf); }
  private remember(token: string, result: FieldItemRunOutcome): void {
    this.receipts.set(token, result.status === 'battle-admitted' ? { ...result, ...(result.fishing ? { fishing: clone(result.fishing) } : {}) }
      : result.status === 'travel-admitted' ? { ...result, travel: result.travel.status === 'awaiting-arrival' ? { ...result.travel } : clone(result.travel) } : clone(result));
    if (this.receipts.size > 256) {
      const oldest = this.receipts.keys().next().value;
      if (oldest !== undefined) { this.receipts.delete(oldest); this.fieldTravels.delete(oldest); for (const [key, entry] of this.requests) if (entry.handoff.token === oldest) this.requests.delete(key); }
    }
  }
  invalidate(): void { this.fieldChecks.clear(); this.blackout.invalidate(); this.travel.invalidate(); this.fieldTravels.clear(); this.travelNativeEntries.splice(0); this.travelWeather.clear(); if(this.owner?.kind==='completed-step')this.owner.cancel();if(this.owner?.kind==='field-item')void this.owner.fishing?.cancel('scene-closed');if(this.owner&&this.owner.kind!=='completed-step')void this.owner.move?.cancel();this.moveRequests.clear();this.surf={surfBase:null,endingSurf:false};this.records=[];this.stepReceipts.clear();this.owner = null; this.starting = null; this.entries.clear(); this.requests.clear(); this.receipts.clear(); this.notices.splice(0); this.observations.clear(); this.noticeReceipts.splice(0); this.noticeSequence = 0; this.local = newWorldLocalState(); this.runtime = newEncounterRuntime(); this.tables = null; }
  observeEntry(entry: WorldMapEntry): WorldOperationOutcome {
    if (!this.validEntry(entry)) return { status: 'refused', reason: 'invalid-map-entry' };
    const claimed = this.travelNativeEntries.findIndex(value => value.mapId === entry.mapId && value.previousMapId === entry.previousMapId && (value.cause === entry.cause || value.cause === 'connection' && entry.cause === 'transfer'));
    if (claimed >= 0) { this.travelNativeEntries.splice(claimed, 1); this.entries.set(entry.id, semanticFingerprint(entry)); return { status: 'duplicate' }; }
    this.travelNativeEntries.splice(0);
    const identity = semanticFingerprint(entry), old = this.observations.get(entry.id), applied = this.entries.get(entry.id);
    if (applied !== undefined) return applied === identity ? { status: 'duplicate' } : { status: 'refused', reason: 'map-entry-conflict' };
    if (old) return old.kind === 'map-entry' && old.identity === identity ? { status: 'queued' } : { status: 'refused', reason: 'map-entry-conflict' };
    if (entry.cause === 'transfer' && entry.previousMapId === entry.mapId) return { status: 'unchanged' };
    const captured = this.captureNotice({ sequence: ++this.noticeSequence, generation: this.options.generation(), contentIdentity: '', status: 'capturing',
      kind: 'map-entry', entry: clone(entry), identity, metadata: null });
    if (captured.status !== 'queued') return captured;
    const drained = this.flushNotices(false);
    return drained.status === 'drained' ? { status: 'committed' } : drained.status === 'refused' ? { status: 'refused', reason: drained.reason ?? 'world-notice-refused' } : captured;
  }
  private queueWeather(intent: WorldWeatherIntent): WorldOperationOutcome {
    if (worldWeatherProblems(intent).length) return { status: 'refused', reason: 'invalid-world-weather' };
    return this.captureNotice({ sequence: ++this.noticeSequence, generation: this.options.generation(), contentIdentity: '', status: 'capturing', kind: 'weather-command', intent: clone(intent) });
  }
  private captureNotice(notice: Notice): WorldOperationOutcome {
    const previous = this.starting, reservation = {}, owner = this.owner;
    this.starting = reservation; this.notices.push(notice);
    if (notice.kind === 'map-entry') this.observations.set(notice.entry.id, notice);
    const current = (): void => { if (this.starting !== reservation || this.owner !== owner || notice.generation !== this.options.generation() || !this.notices.includes(notice)) throw Error('stale-world-notice'); };
    try {
      if (notice.kind === 'map-entry') {
        let observed = false;
        const facts = this.readFacts(content => { current(); notice.contentIdentity = semanticFingerprint(content); observed = true; }); current();
        if (!observed) throw Error('world-content-unavailable');
        if (facts.mapId.status !== 'value' || facts.mapId.value !== notice.entry.mapId) throw Error('current-map-unavailable');
        notice.metadata = clone(facts.mapMetadata);
      } else { const content = this.options.content(); current(); notice.contentIdentity = semanticFingerprint(content); }
      const actualContent = this.options.content(); current();
      if (semanticFingerprint(actualContent) !== notice.contentIdentity) throw Error('world-content-changed');
      if (notice.kind === 'map-entry') {
        const actual = this.options.host?.read(); current();
        if (actual?.mapId.status !== 'value' || actual.mapId.value !== notice.entry.mapId) throw Error('current-map-unavailable');
      }
      notice.status = 'ready';
      // Only adjacent, not-yet-applied commands can supersede one another. A map notice is an ordering barrier.
      const index = this.notices.indexOf(notice), prior = this.notices[index - 1];
      if (notice.kind === 'weather-command' && prior?.kind === 'weather-command' && prior.status === 'ready') this.notices.splice(index - 1, 1);
      return { status: 'queued' };
    } catch (error) {
      const index = this.notices.indexOf(notice); if (index >= 0) this.notices.splice(index, 1);
      if (notice.kind === 'map-entry' && this.observations.get(notice.entry.id) === notice) this.observations.delete(notice.entry.id);
      return { status: 'refused', reason: why(error) };
    } finally { if (this.starting === reservation) this.starting = previous; }
  }
  private validEntry(entry: WorldMapEntry): boolean {
    return !!entry && typeof entry.id === 'string' && entry.id.length > 0 && positive(entry.mapId) &&
      (entry.previousMapId === null || positive(entry.previousMapId)) && typeof entry.rebuilt === 'boolean' && ['new-game', 'load', 'transfer', 'connection'].includes(entry.cause);
  }
  private drawEntryWeather(current: () => void, notice?: Extract<Notice, { kind: 'map-entry' }>): number {
    current();
    let draw = notice?.weatherDraw;
    if (!draw) {
      try {
        const roll = this.options.random?.(100);
        draw = typeof roll === 'number' && Number.isInteger(roll) && roll >= 0 && roll < 100
          ? { status: 'value', value: roll } : { status: 'failed', reason: 'invalid-world-random' };
      } catch (error) { draw = { status: 'failed', reason: why(error) }; }
      // The draw belongs to this physical entry, even if its temporary owner was cancelled by the random port.
      // Retain only the draw; every resumed plan still starts from fresh state and captured map metadata.
      if (notice) notice.weatherDraw = draw;
    }
    current();
    if (draw.status === 'failed') throw Error(draw.reason);
    return draw.value;
  }
  private planEntry(before: GameState, entry: WorldMapEntry, metadata: WorldBusinessFacts['mapMetadata'], current: () => void, notice?: Extract<Notice, { kind: 'map-entry' }>): { next: GameState; diagnostics: string[] } {
    const next = clone(before), diagnostics: string[] = [];
    if (!next.world.visitedMaps.includes(entry.mapId)) next.world.visitedMaps.push(entry.mapId);
    if (metadata.status === 'value') {
      if (metadata.value.darkMap !== true) next.world.flashUsed = false;
      if (metadata.value.healingSpot) next.world.healingSpot = clone(metadata.value.healingSpot);
    } else if (metadata.status === 'absent') next.world.flashUsed = false;
    else diagnostics.push('map-metadata-unavailable: Flash and weather retained');
    const crossed = entry.previousMapId !== null && entry.previousMapId !== entry.mapId;
    if (crossed && entry.cause !== 'load' && (metadata.status === 'value' || metadata.status === 'absent')) {
      const weather = metadata.status === 'value' ? metadata.value.weather : undefined;
      let type: WorldWeatherIntent['type'] = 'None';
      if (weather) {
        const roll = this.drawEntryWeather(current, notice);
        if (roll < weather.chance) type = weather.type;
      }
      if (type !== next.world.weather.type) next.world.weather = { type, strength: type === 'None' ? 0 : 60, durationFrames: entry.cause === 'connection' ? 20 : 0 };
    }
    if (crossed && entry.cause === 'connection') next.world.weather.durationFrames = 20;
    return { next, diagnostics };
  }
  private appliedEntry(entry: WorldMapEntry, identity: string, next: GameState): void {
    this.tables = null;
    this.local = newWorldLocalState();
    this.runtime = { ...this.runtime, graceSteps: 0, ...(entry.cause === 'load' || entry.cause === 'new-game' ? { accumulator: 0 } : {}), currentMapId: entry.mapId, loadedVersion: next.world.encounterVersion };
    this.entries.set(entry.id, identity);
  }
  /** Only this specific FIFO is drained; existing global busy gates remain in force for all other operations. */
  flushNotices(takeReceipts = true): WorldNoticeFlushOutcome {
    return this.drainNotices(takeReceipts, null);
  }
  /** The prepared owner may settle earlier observations before it starts consuming world facts. */
  private drainNotices(takeReceipts: boolean, preparedOwner: FieldOwner | null, consuming = false, sync?: NoticeSynchronization): WorldNoticeFlushOutcome {
    const ownsLease = (): boolean => this.owner === preparedOwner && (!preparedOwner || (!preparedOwner.running || consuming) && !preparedOwner.cancelled);
    if (!ownsLease() || this.travel.active || this.blackout.active && !sync || this.starting || !this.options.canChangeWeather() || this.options.inventory.active) return { status: 'pending', receipts: [], pending: this.notices.length };
    const reservation = {}, generation = this.options.generation(); this.starting = reservation;
    try {
      while (this.notices.length) {
        const notice = this.notices[0]!;
        if (notice.status === 'capturing') return { status: 'pending', receipts: [], pending: this.notices.length };
        if (notice.invalid) return { status: 'refused', receipts: [], pending: this.notices.length, reason: notice.invalid };
        notice.status = 'applying';
        const current = (): void => { if (this.starting !== reservation || !ownsLease() || generation !== this.options.generation() || notice.generation !== generation || this.notices[0] !== notice) throw Error('stale-world-notice'); };
        let beforeIdentity: string;
        const checkContent = (actual: Content): void => {
          current(); if (semanticFingerprint(actual) !== notice.contentIdentity) throw Error('world-content-changed');
          const latest = this.options.read(); current(); if (semanticFingerprint(latest) !== beforeIdentity) throw Error('world-notice-state-changed');
        };
        try {
          current(); const before = this.options.read(); current(); beforeIdentity = semanticFingerprint(before); sync?.before(before);
          const content = this.options.content(); checkContent(content);
          const planned = notice.kind === 'map-entry' ? this.planEntry(before, notice.entry, notice.metadata!, current, notice) : { next: clone(before), diagnostics: [] };
          if (notice.kind === 'weather-command') planned.next.world.weather = clone(notice.intent);
          current(); if (sync?.install) sync.install(planned.next, current, content); else this.options.install(planned.next, checkContent); current();
          if (notice.kind === 'map-entry') this.appliedEntry(notice.entry, notice.identity, planned.next);
          sync?.applied(planned.next);
          this.notices.shift();
          if (notice.kind === 'map-entry' && this.observations.get(notice.entry.id) === notice) this.observations.delete(notice.entry.id);
          this.noticeReceipts.push(Object.freeze({ sequence: notice.sequence, kind: notice.kind, weather: Object.freeze(clone(planned.next.world.weather)),
            weatherChanged: before.world.weather.type !== planned.next.world.weather.type,
            ...(planned.diagnostics.length ? { diagnostics: Object.freeze([...planned.diagnostics]) } : {}),
            ...(notice.kind === 'map-entry' ? { entryId: notice.entry.id, mapId: notice.entry.mapId } : {}) }));
        } catch (error) {
          notice.status = 'ready';
          // Cancelling this lease leaves an uncommitted observation for the ordinary safe-boundary drain.
          if (preparedOwner && !ownsLease() && generation === this.options.generation()) return { status: 'pending', receipts: [], pending: this.notices.length };
          if (sync && why(error) === 'world-field-consumer-stale') return { status: 'pending', receipts: [], pending: this.notices.length };
          notice.invalid = why(error); return { status: 'refused', receipts: [], pending: this.notices.length, reason: notice.invalid };
        }
      }
      const receipts = takeReceipts ? this.noticeReceipts.splice(0).sort((a, b) => a.sequence - b.sequence) : [];
      return { status: 'drained', receipts, pending: 0 };
    } finally { if (this.starting === reservation) this.starting = null; }
  }
  completeStep(step: CompletedWorldStep, connection?: { readonly owner: object; readonly receipt: TravelReceipt }): Promise<CompletedWorldStepOutcome> {
    const refused = (reason: string): Promise<CompletedWorldStepOutcome> => Promise.resolve({ status: 'refused', reason,
      prefix: { stepCommitted: false, repelRenewed: false, poisonMembersCommitted: 0, repelActiveAtStart: false } });
    const connectionHandoff = !!connection && this.travel.connectionStepId(connection.owner, connection.receipt) === step.id;
    if (this.blackout.active || this.starting || this.travel.active && !connectionHandoff) return refused('operation-active');
    const owner = this.owner;
    if (this.recoveryPending && !this.stepReceipts.has(step?.id)) return refused('blackout-return-pending');
    if (owner?.kind === 'completed-step' && sameCompletedStep(owner.step, step)) return owner.promise!;
    if (owner) return refused('operation-active');
    const drained = this.flushNotices(false);
    // A failed FIFO head still blocks world consumers and saves. It cannot consume the native
    // arrival of a later real step, whose prefix and event dispatch have their own actual lease.
    const failedNotice = drained.status === 'refused' && !!this.notices[0]?.invalid;
    const permitted = failedNotice || connectionHandoff ? this.options.canStartCompletedStep?.() === true : this.options.canStart();
    if (this.owner || this.starting || this.notices.length > 0 && !failedNotice || !permitted || this.options.inventory.active) return refused('operation-active');
    this.starting = {};
    try {
      const prior = this.stepReceipts.get(step?.id);
      if (prior) {
        if (!sameCompletedStep(prior.step, step)) return refused('completed-step-conflict');
        return Promise.resolve(prior.outcome.status === 'battle-admitted' ? { ...prior.outcome, prefix: clone(prior.outcome.prefix) }
          : prior.outcome.status === 'completed' ? { ...clone(prior.outcome), status: 'duplicate' } : clone(prior.outcome));
      }
      const host = this.options.completedSteps;
      if (!host) return refused('completed-step-host-unavailable');
      const operation = this.createCompletedStep(step);
      this.owner = operation;
      return this.runCompletedStep(operation, connection);
    } finally { this.starting = null; }
  }
  /** WP61's script check is a request, never a caller-authenticated field/battle admission. */
  checkFieldBlackout(requestId: string): Promise<FieldBlackoutCheckOutcome> {
    if (typeof requestId !== 'string' || !requestId.length || requestId.length > 128) return Promise.resolve({ status: 'refused', reason: 'invalid-request-id' });
    const previous = this.fieldChecks.get(requestId); if (previous) return previous;
    if (this.active || !this.canStartBusiness() || this.options.inventory.active) return Promise.resolve({ status: 'refused', reason: 'operation-active' });
    const reservation = {}, generation = this.options.generation(); this.starting = reservation;
    const result = Promise.resolve().then((): Promise<FieldBlackoutCheckOutcome> | FieldBlackoutCheckOutcome => {
      try {
        if (!this.options.blackoutAtomic) throw Error('blackout-atomic-unavailable');
        const required = this.options.blackoutAtomic(() => actual => {
          if (this.starting !== reservation || generation !== this.options.generation() || actual.generation !== generation || this.owner || this.travel.active || this.blackout.active
            || this.notices.length > 0 || this.options.canStartCompletedStep?.() !== true || this.options.inventory.active) throw Error('operation-active');
          if (validateGameContent(actual.game, actual.content).length) throw Error('invalid-blackout-state');
          return { value: !actual.game.party.some(member => !member.isEgg && member.hp > 0) };
        });
        return required ? this.blackout.checkField(`field-check:${generation}:${requestId}`) : { status: 'not-required' };
      } catch (error) { return { status: 'refused', reason: why(error) }; }
      finally { if (this.starting === reservation) this.starting = null; }
    });
    this.fieldChecks.set(requestId, result); return result;
  }
  isFieldBlackoutCheckPending(requestId: string): boolean {
    return typeof requestId === 'string' && this.fieldChecks.has(requestId) && this.blackout.isFieldCheckPending(`field-check:${this.options.generation()}:${requestId}`);
  }
  private createCompletedStep(step: CompletedWorldStep): CompletedStepOperation {
    const host = this.options.completedSteps; if (!host) throw Error('completed-step-host-unavailable');
    const hasSurfHandler = this.surf.surfBase !== null;
      const source = hasSurfHandler ? this.options.lifecycle?.() : undefined;
      const nativeCurrent = (): void => {
        const actual = this.options.lifecycle?.();
        if (!source || !actual || actual.map !== source.map || actual.mapId !== source.mapId || actual.player !== source.player || !operation.acceptsNativeScene(actual, source.scene)
          || actual.map !== step.map || actual.mapId !== step.mapId || actual.player !== step.player) throw Error('completed-step-native-lifecycle-changed');
        if (!actual.playerPosition || actual.playerPosition.x !== step.x || actual.playerPosition.y !== step.y) throw Error('completed-step-location-changed');
      };
      const operation = new CompletedStepOperation(step, `completed-step:${this.options.generation()}:${++this.sequence}`, {
        read: this.options.read, content: this.options.content, generation: this.options.generation, install: this.options.install,
        inventory: this.options.inventory, host, random: this.options.random, lifecycle: this.options.lifecycle, canRetireScene: () => this.owner === null && !this.options.inventory.active && this.options.canStart(), owns: candidate => this.owner === candidate,
        ordinaryBlocked: () => this.notices.length > 0,
        ...(hasSurfHandler ? { nativeCurrent, afterStep: (parent: CompletedStepOperation, state: CompletedStepHandlerState) => this.cleanupCompletedSurf(parent, state, nativeCurrent) } : {}),
        ...(this.options.ordinaryEncounters ? { ordinary: (operation: CompletedStepOperation, installRegistration: (next: GameState) => void) => this.ordinary(operation, installRegistration) } : {}),
      });
    return operation;
  }
  private runCompletedStep(operation: CompletedStepOperation, connection?: { readonly owner: object; readonly receipt: TravelReceipt }): Promise<CompletedWorldStepOutcome> {
      operation.promise = Promise.resolve().then(() => operation.run()).then(original => {
        let outcome: CompletedWorldStepOutcome = original;
        // Only this real, still-owned D operation may hand off its consumed poison permit.
        // Register F before dropping D. Fresh field presentation retains F's save
        // barrier and primes its settled checkpoint only after the entry fade ACK.
        if (outcome.status === 'blackout-required' && this.owner === operation && this.blackout.enabled) {
          operation.assertCurrent();
          const result = this.blackout.admit({ kind: 'field', sourceId: operation.permit.token }, null, connection ?? null);
          operation.admitted = Reflect.apply(blackoutFieldAdmission, this.blackout, [operation.permit.token, operation.permit.generation]) === true;
          if (operation.admitted) outcome = { ...outcome, blackoutAdmitted: true };
          else if (result?.status === 'failed') outcome = { status: 'failed', reason: result.reason, prefix: clone(outcome.prefix) };
        }
        if (this.owner === operation || operation.admitted && operation.permit.generation === this.options.generation()) {
          if (this.owner === operation) this.owner = null;
          this.stepReceipts.set(operation.step.id, { step: operation.step, outcome: outcome.status === 'battle-admitted' ? { ...outcome, prefix: clone(outcome.prefix) } : clone(outcome) });
        }
        if (operation.permit.generation === this.options.generation()) this.flushNotices(false);
        return outcome;
      });
      return operation.promise;
  }
  /** The real completed-step owner lends a single cleanup child its writer, never the global lock. */
  private async cleanupCompletedSurf(parent: CompletedStepOperation, state: CompletedStepHandlerState, nativeCurrent: () => void): Promise<void> {
    const atomic = this.options.atomic, host = this.options.fieldMoves;
    if (!atomic || !host) throw Error('completed-step-surf-handler-unavailable');
    const access = <T>(finish: (actual: WorldAtomicObservation) => AtomicStateResult<T>): T => atomic(() => {
      parent.assertCurrent();
      return actual => {
        if (this.owner !== parent || parent.cancelled || actual.generation !== parent.permit.generation) throw Error('stale-completed-step-surf-child');
        nativeCurrent(); state.current(actual.game, actual.content);
        return finish(actual);
      };
    });
    const child = new FieldMoveOperation({ owner: parent, generation: parent.permit.generation, action: { kind: 'surf-cleanup' }, host,
      cleanupPlayer: parent.step.player,
      observe: () => access(actual => ({ value: { ...this.fieldState(actual.game), owner: parent, generation: actual.generation, content: actual.content, mapId: actual.lifecycle.mapId } })),
      commit: (update, current) => {
        const installed = access(actual => {
          const before = this.fieldState(actual.game);
          current({ ...before, owner: parent, generation: actual.generation, content: actual.content, mapId: actual.lifecycle.mapId });
          const next = applyFieldMoveUpdate(before, update);
          if (validateGameContent(next.game, actual.content).length) throw Error('invalid-completed-step-surf-state');
          this.local = clone(next.local); this.runtime = clone(next.encounterRuntime); this.surf = clone(next.surf); this.records = clone(next.records ?? []);
          return { value: this.fieldState(next.game), next: next.game };
        });
        state.installed(installed.game);
        return installed;
      },
    });
    const outcome = await child.run();
    if (outcome.status !== 'completed') throw Error(outcome.reason ?? 'completed-step-surf-cleanup-failed');
    access(() => ({ value: undefined }));
  }
  /** A terminal native arrival only; never a D permit or an operation admission. */
  isOwnedSurfLandingTerminalArrival(ticket: object, entry: object): boolean {
    const owner = this.owner;
    return owner?.kind === 'field-move' && !owner.cancelled && owner.permit.generation === this.options.generation()
      && owner.terminalArrival?.ticket === ticket && owner.terminalArrival.entry === entry && owner.terminalArrival.child === owner.move;
  }
  isOwnedCompletedStepArrival(owner: CompletedStepPermit, id: string): boolean {
    const operation = this.owner;
    return operation instanceof CompletedStepOperation && operation.isOwnedArrival(owner, id);
  }
  cancelCompletedStep(id: string): WorldOperationOutcome {
    if (this.owner?.kind !== 'completed-step' || this.owner.step.id !== id) return this.stepReceipts.get(id)?.outcome.status === 'cancelled' ? { status: 'duplicate' } : { status: 'refused', reason: 'stale-completed-step' };
    const operation = this.owner, outcome = operation.cancel();
    this.owner = null; this.stepReceipts.set(id, { step: operation.step, outcome }); this.flushNotices(false);
    return { status: 'unchanged' };
  }
  assertRepelChild(child: object): void {
    if (this.owner?.kind !== 'completed-step') throw Error('stale-world-selection');
    this.owner.assertRepelChild(child);
  }
  ownedRepelSceneHooks(owner: CompletedStepPermit, selection: OwnedRepelSelection) {
    return this.owner?.kind === 'completed-step' ? this.owner.ownedSceneHooks(owner, selection) : null;
  }
  isOwnedRepelSelection(owner: CompletedStepPermit, selection: OwnedRepelSelection): boolean {
    return this.owner?.kind === 'completed-step' && this.owner.isOwnedSelection(owner, selection);
  }
  private ordinary(operation: CompletedStepOperation, installRegistration: (next: GameState) => void): { status: 'battle-admitted'; admission: WorldBattleAdmission } | { status: 'no-encounter' | 'unsupported'; reason: string } {
    operation.assertCurrent();
    if (this.notices.length) return { status: 'no-encounter', reason: 'world-notice-pending' };
    if (!this.options.ordinaryEncounters) return { status: 'unsupported', reason: 'ordinary-encounter-handler-unavailable' };
    const result = prepareOrdinaryEncounter(operation.step, operation.repelWasActive, {
      read: this.options.read, contentView: this.options.contentView, assertCurrent: content => { operation.assertCurrent(content); },
      facts: () => this.facts(), host: this.options.ordinaryEncounters!, random: upperBound => { if (!this.options.random) throw Error('no-random'); return this.options.random(upperBound); },
      tables: (game, content, mapId) => {
        if (!this.tables || this.runtime.currentMapId !== mapId || this.runtime.loadedVersion !== game.world.encounterVersion) {
          this.tables = findWorldEncounterTables(content, mapId, game.world.encounterVersion);
          this.runtime = { ...this.runtime, graceSteps: 0, currentMapId: mapId, loadedVersion: game.world.encounterVersion };
        }
        return clone(this.tables);
      },
      runtime: () => this.runtime, installRuntime: next => { operation.assertCurrent(); this.runtime = { ...next }; },
      local: () => this.local, switchOn: this.options.switchOn, now: this.options.now, allowHeldItemSources: this.options.allowHeldItemSources,
    });
    if (result.status !== 'prepared') return result;
    const current = operation.assertCurrent();
    const registration = planInitialWildRegistration(current.game, current.content, result.prepared);
    if (registration.next) installRegistration(registration.next);
    const offer: WorldBattleOffer = Object.freeze({ token: `${operation.permit.token}:battle`, generation: operation.permit.generation });
    this.offers.set(offer, { operation, prepared: registration.prepared, taken: false });
    const admission = this.options.admit(operation.permit, offer);
    return { status: 'battle-admitted', admission };
  }
  captureBattleOffer(parent: WorldBattleParentPermit, offer: WorldBattleOffer): PreparedWorldEncounter {
    const entry = this.offers.get(offer);
    if (!entry || entry.taken || this.owner !== entry.operation || parent !== entry.operation.permit) throw Error('stale-world-battle-offer');
    if (entry.operation.kind === 'completed-step') entry.operation.assertCurrent();
    else this.assertFieldEncounter(entry.operation, entry.prepared);
    return entry.prepared;
  }
  /** App has already installed its battle reservation. This transition has no port calls or await. */
  retireToBattle(parent: WorldBattleParentPermit, offer: WorldBattleOffer): void {
    const entry = this.offers.get(offer);
    if (!entry || entry.taken || this.owner !== entry.operation || parent !== entry.operation.permit) throw Error('stale-world-battle-offer');
    if (entry.operation.kind !== 'completed-step' && (entry.operation.cancelled || entry.operation.permit.generation !== this.options.generation())) throw Error('stale-world-battle-offer');
    entry.taken = true; entry.operation.admitted = true; this.owner = null;
    this.runtime = { ...this.runtime, graceSteps: 0, accumulator: 0 };
  }
  facts(): WorldBusinessFacts { return this.readFacts(); }
  private readFacts(observeContent?: (content: Content) => void): WorldBusinessFacts {
    let host: HostWorldFacts;
    try {
      const raw = this.options.host?.read();
      host = raw ? { mapId: checkedFact(raw.mapId, positive), hour: checkedFact(raw.hour, (v): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 24), cycling: checkedFact(raw.cycling, boolean), diving: checkedFact(raw.diving, boolean) }
        : { mapId: unavailable(), hour: unavailable(), cycling: unavailable(), diving: unavailable() };
    } catch { const bad = { status: 'invalid' as const, reason: 'world-provider-threw' }; host = { mapId: bad, hour: bad, cycling: bad, diving: bad }; }
    let metadata: WorldBusinessFacts['mapMetadata'] = unavailable(), weather: WorldBusinessFacts['weather'] = unavailable(), surfing: WorldBusinessFacts['surfing'] = unavailable();
    try {
      const game = this.options.read();
      weather = { status: 'value', value: { ...clone(game.world.weather), category: worldWeatherCategory(game.world.weather.type) } };
      surfing = { status: 'value', value: game.world.surfing };
      if (host.mapId.status === 'value') {
        const content = this.options.content(); observeContent?.(content);
        const maps = content.mapMetadata?.maps;
        metadata = maps ? Object.hasOwn(maps, String(host.mapId.value)) ? { status: 'value', value: clone(maps[String(host.mapId.value)]!) } : { status: 'absent' } : unavailable();
      } else metadata = { status: host.mapId.status === 'invalid' ? 'invalid' : 'unavailable', reason: 'current-map-unavailable' };
    } catch { /* Unusable state/content remains unavailable, never a fabricated None/false. */ }
    return { ...host, mapMetadata: metadata, weather, surfing };
  }
  weather(intent: WorldWeatherIntent): WorldOperationOutcome {
    if (this.travel.active || this.notices.length || this.starting || this.owner && (this.owner.kind === 'completed-step' || this.owner.kind === 'field-move' || this.owner.kind === 'field-item' && !!this.owner.move || !this.owner.running) || !this.options.canChangeWeather() || this.options.inventory.active) {
      const captured = this.queueWeather(intent);
      if (captured.status === 'queued') this.flushNotices(false);
      return captured;
    }
    const sequence = ++this.noticeSequence;
    let reservation: object | null = null;
    const generation = this.options.generation(), owner = this.owner;
    const current = (): void => { if (this.starting !== reservation || generation !== this.options.generation() || this.owner !== owner || owner?.kind === 'field-item' && owner.cancelled) throw Error('stale-world-operation'); };
    let contentIdentity = owner?.kind === 'field-item' ? owner.contentIdentity : undefined;
    const checkContent = (content: Content): void => { current(); const identity = semanticFingerprint(content); if (contentIdentity !== undefined && identity !== contentIdentity) throw Error('world-content-changed'); contentIdentity = identity; };
    try {
      if (this.starting || this.owner && !this.owner.running || !this.options.canChangeWeather() || this.options.inventory.active) return { status: 'refused', reason: 'operation-active' };
      this.starting = reservation = {};
      const problems = worldWeatherProblems(intent); if (problems.length) return { status: 'refused', reason: 'invalid-world-weather' };
      const before = this.options.read(); current();
      if (before.world.pendingReturn !== null) return { status: 'refused', reason: 'blackout-return-pending' };
      if (semanticFingerprint(before.world.weather) === semanticFingerprint(intent)) {
        this.noticeReceipts.push(Object.freeze({ sequence, kind: 'weather-command', weather: Object.freeze(clone(intent)), weatherChanged: false }));
        return { status: 'unchanged' };
      }
      const next = clone(before); next.world.weather = clone(intent);
      current(); this.options.install(next, checkContent); current();
      this.noticeReceipts.push(Object.freeze({ sequence, kind: 'weather-command', weather: Object.freeze(clone(intent)), weatherChanged: before.world.weather.type !== intent.type }));
      return { status: 'committed' };
    } catch (e) { return { status: 'refused', reason: why(e) }; }
    finally { if (this.starting === reservation) this.starting = null; }
  }
  enter(entry: WorldMapEntry): WorldOperationOutcome {
    const sequence = ++this.noticeSequence;
    let reservation: object | null = null;
    const generation = this.options.generation();
    const current = (): void => { if (this.starting !== reservation || generation !== this.options.generation()) throw Error('stale-world-operation'); };
    let contentIdentity: string | undefined, loadedContent: Content | undefined;
    const checkContent = (content: Content): void => { current(); const identity = semanticFingerprint(content); if (contentIdentity !== undefined && identity !== contentIdentity) throw Error('world-content-changed'); contentIdentity = identity; };
    try {
      if (this.active || !this.options.canStart() || this.options.inventory.active) return { status: 'refused', reason: 'operation-active' };
      if (!entry || typeof entry.id !== 'string' || !entry.id.length || !positive(entry.mapId) || entry.previousMapId !== null && !positive(entry.previousMapId) || typeof entry.rebuilt !== 'boolean' || !['new-game', 'load', 'transfer', 'connection'].includes(entry.cause)) return { status: 'refused', reason: 'invalid-map-entry' };
      const identity = semanticFingerprint(entry), previous = this.entries.get(entry.id);
      if (previous !== undefined) return previous === identity ? { status: 'duplicate' } : { status: 'refused', reason: 'map-entry-conflict' };
      if (entry.cause === 'transfer' && entry.previousMapId === entry.mapId) return { status: 'unchanged' };
      this.starting = reservation = {};
      const before = this.options.read(); current();
      const facts = this.readFacts(content => { contentIdentity = semanticFingerprint(content); loadedContent = content; }); current();
      if (facts.mapId.status !== 'value' || facts.mapId.value !== entry.mapId) return { status: 'refused', reason: 'current-map-unavailable' };
      const { next, diagnostics } = this.planEntry(before, entry, facts.mapMetadata, current);
      current(); this.options.install(next, checkContent); current();
      this.appliedEntry(entry, identity, next);
      this.noticeReceipts.push(Object.freeze({ sequence, kind: 'map-entry', entryId: entry.id, mapId: entry.mapId,
        weather: Object.freeze(clone(next.world.weather)), weatherChanged: before.world.weather.type !== next.world.weather.type,
        ...(diagnostics.length ? { diagnostics: Object.freeze([...diagnostics]) } : {}) }));
      this.tables = loadedContent ? findWorldEncounterTables(loadedContent, entry.mapId, next.world.encounterVersion) : null;
      return { status: 'committed', ...(diagnostics.length ? { diagnostics } : {}) };
    } catch (e) { return { status: 'refused', reason: why(e) }; }
    finally { if (this.starting === reservation) this.starting = null; }
  }
  prepareShortcutItem(inventoryToken: string, request: object, ticket: InventoryTicket): FieldItemHandoffOutcome {
    const admission = this.options.shortcutAdmission?.(request), selection = admission?.selection;
    if (!admission || !selection || selection.kind !== 'item' || selection.itemId !== ticket.itemId) return { status: 'refused', reason: 'stale-shortcut-request' };
    return this.prepare(inventoryToken, `shortcut:${this.options.generation()}:${this.sequence + 1}`, ticket, 'shortcut', { request, ...admission });
  }
  prepare(inventoryToken: string, requestId: string, ticket: InventoryTicket, entry: 'bag' | 'shortcut' = 'bag', shortcut?: ShortcutOwner): FieldItemHandoffOutcome {
    let reservation: object | null = null;
    const generation = this.options.generation();
    const current = (): void => { if (this.starting !== reservation || generation !== this.options.generation()
      || shortcut && this.options.shortcutSelection?.(shortcut.request, true) !== shortcut.selection) throw Error('stale-field-item'); };
    try {
      if (typeof requestId !== 'string' || !requestId.length || requestId.length > 64 || !['bag', 'shortcut'].includes(entry)) throw Error('invalid-field-item-request');
      const requestKey = `${inventoryToken}\0${requestId}`;
      const fingerprint = semanticFingerprint({ inventoryToken, ticket, entry, registeredShortcut: !!shortcut }), prior = this.requests.get(requestKey);
      if (prior) return prior.fingerprint === fingerprint ? { status: 'handoff', handoff: clone(prior.handoff) } : { status: 'refused', reason: 'request-conflict' };
      if (this.active || !this.canStartBusiness()) throw Error('operation-active');
      this.starting = reservation = {};
      const lifecycle = shortcut ? this.options.lifecycle?.() : undefined;
      if (shortcut && !lifecycle?.playerPosition) throw Error('shortcut-native-source-unavailable');
      const { content, game } = this.options.inventory.captureFieldTicket(inventoryToken, ticket); current();
      const item = itemOf(catalogOf(content), ticket.itemId), action = item && classifyFieldItem(item);
      if (!item || !action) throw Error('not-a-field-item');
      if (itemQuantity(game.inventory, item.id, catalogOf(content)) < 1) throw Error('not-enough-items');
      if (shortcut && !game.inventory.registeredItems.includes(item.id)) throw Error('shortcut-not-registered');
      const facts = this.facts(); current(); if (facts.mapId.status !== 'value') throw Error('current-map-unavailable');
      this.options.inventory.captureFieldTicket(inventoryToken, ticket); current();
      const handoff: FieldItemHandoff = { token: `field-item:${generation}:${++this.sequence}`, generation, requestId, itemId: item.id, entry, action };
      this.options.inventory.reserveFieldTicket(inventoryToken); current();
      this.owner = { kind: 'field-item', permit: Object.freeze({ kind: 'field-item', token: handoff.token, generation }), admitted: false, inventoryToken, handoff, mapId: facts.mapId.value, contentIdentity: semanticFingerprint(content), inventoryIdentity: semanticFingerprint(game.inventory.pockets), running: false, cancelled: false,
        ...(shortcut ? { shortcut, lifecycle } : {}) };
      this.requests.set(requestKey, { fingerprint, handoff: clone(handoff) });
      return { status: 'handoff', handoff: clone(handoff) };
    } catch (e) { return { status: 'refused', reason: why(e) }; }
    finally { if (this.starting === reservation) this.starting = null; }
  }
  cancel(token: string): WorldOperationOutcome {
    if (this.receipts.get(token)?.status === 'cancelled') return { status: 'duplicate' };
    const travel = this.fieldTravels.get(token);
    if (travel) {
      if (travel.generation !== this.options.generation()) return { status: 'refused', reason: 'stale-field-item' };
      const result = this.travel.cancel(travel.id);
      if (result.status !== 'cancelled') return { status: 'refused', reason: 'field-travel-not-cancelled' };
      this.remember(token, { status: 'cancelled' }); return { status: 'unchanged' };
    }
    if (!this.owner || this.owner.kind !== 'field-item' || this.owner.handoff.token !== token) return { status: 'refused', reason: 'stale-field-item' };
    this.owner.cancelled = true;
    if (this.owner.fishing) { void this.owner.fishing.cancel(); return { status: 'unchanged' }; }
    if (this.owner.move) { void this.owner.move.cancel(); return { status: 'unchanged' }; }
    this.options.inventory.releaseFieldTicket(this.owner.inventoryToken);
    this.owner = null; this.remember(token, { status: 'cancelled' }); this.flushNotices(false); return { status: 'unchanged' };
  }
  run(token: string): Promise<FieldItemRunOutcome> {
    const old = this.receipts.get(token);
    if (old) return Promise.resolve(old.status === 'completed' ? { ...old, status: 'duplicate' } : old.status === 'battle-admitted' ? { ...old }
      : old.status === 'travel-admitted' ? { ...old, travel: old.travel.status === 'awaiting-arrival' ? { ...old.travel } : clone(old.travel) } : clone(old));
    const owner = this.owner;
    if (!owner || owner.kind !== 'field-item' || owner.handoff.token !== token) return Promise.resolve({ status: 'refused', reason: 'stale-field-item' });
    if (owner.promise) return owner.promise;
    // Reserve the promise before any port can reenter; keep the owner prepared until its notice barrier passes.
    owner.promise = Promise.resolve().then(() => this.execute(owner)).then(result => {
      if (this.owner === owner || (owner.admitted || owner.travelAdmitted) && owner.handoff.generation === this.options.generation()) { if (this.owner === owner) this.owner = null; this.remember(token, result); }
      if (owner.handoff.generation === this.options.generation()) this.flushNotices(false);
      return result;
    });
    return owner.promise;
  }
  retryFieldTravel(token: string, onRetired?: (current: () => boolean) => void): Promise<FieldItemRunOutcome> {
    const record = this.fieldTravels.get(token);
    if (!record || record.generation !== this.options.generation()) return Promise.resolve({ status: 'refused', reason: 'stale-field-item' });
    const terminal = (): boolean => { const receipt = this.receipts.get(token); return receipt?.status === 'completed' || receipt?.status === 'duplicate' || receipt?.status === 'cancelled'; };
    if (terminal() && !this.travel.hasPendingArrivalRetirement(record.id)) return Promise.resolve({ status: 'failed', reason: 'travel-not-retryable' });
    if (record.retry) return record.retry.promise;
    // Publish the one private promise BEFORE retry preparation or native providers can reenter.
    let resolveResult!: (result: FieldItemRunOutcome) => void;
    const promise = new Promise<FieldItemRunOutcome>(resolve => { resolveResult = resolve; });
    const pending: FieldTravelRetry = { promise, owner: null };
    record.retry = pending;
    const finish = (result: WorldTravelOutcome): void => {
      const outcome: FieldItemRunOutcome = result.status === 'failed' ? { status: 'failed', reason: result.reason } : result.status === 'cancelled' ? { status: 'cancelled' }
        : result.status === 'completed' ? { status: 'completed', itemId: record.itemId, consumed: record.consumable }
        : { status: 'travel-admitted', itemId: record.itemId, consumed: false, travel: result };
      if (record.generation === this.options.generation() && this.fieldTravels.get(token) === record && record.retry === pending
        && pending.owner && this.travel.isRetryExecutionCurrent(record.id, pending.owner) && !terminal()) this.remember(token, outcome);
      if (record.retry === pending) delete record.retry;
      resolveResult(outcome);
    };
    try {
      void this.travel.retry(record.id, owner => { if (record.retry === pending) pending.owner = owner; }, current => {
        if (record.retry !== pending || !pending.owner) return;
        onRetired?.(() => record.generation === this.options.generation() && this.fieldTravels.get(token) === record
          && !record.retry && !!pending.owner && this.travel.isRetryExecutionCurrent(record.id, pending.owner) && current(record.id, pending.owner));
      })
        .then(finish, error => finish({ status: 'failed', reason: why(error) }));
    } catch (error) { finish({ status: 'failed', reason: why(error) }); }
    return promise;
  }
  /** A host may check the issued object; a copied token or structural tag grants no authority. */
  assertFishingOwner(candidate: object): void {
    const owner = this.owner;
    if (!owner || owner.kind !== 'field-item' || owner !== candidate || owner.cancelled || owner.handoff.generation !== this.options.generation() || !owner.fishing) throw Error('stale-fishing-parent');
  }
  private fishingAccess<T>(owner: HandoffOwner, finish: (actual: FishingObservation) => AtomicStateResult<T>): T {
    this.assertFishingOwner(owner);
    return this.fieldAccess(owner, finish);
  }
  private fieldAccess<T>(owner: FieldOwner, finish: (actual: NativeFieldObservation) => AtomicStateResult<T>, jointContent = false): T {
    const atomic = jointContent ? this.options.travelAtomic : this.options.atomic;
    if (!atomic) throw Error('fishing-atomic-state-unavailable');
    return atomic(() => {
      // Map/provider reads finish before the native slot captures the joint materialized observation.
      if (this.owner !== owner || owner.cancelled || owner.permit.generation !== this.options.generation()) throw Error('stale-field-parent');
      const host = this.options.host?.read();
      if (host?.mapId.status !== 'value' || host.mapId.value !== owner.mapId) throw Error('field-map-changed');
      return actual => {
        if (this.owner !== owner || owner.cancelled || actual.generation !== owner.permit.generation) throw Error('stale-fishing-parent');
        // These identities are native own-data observations, made after every reentrant provider.
        // No host mapId/scene method runs between this guard and the actual state-slot assignment.
        const life = actual.lifecycle, initial = owner.lifecycle;
        if (life.mapId !== owner.mapId) throw Error('field-map-changed');
        if (initial && (life.map !== initial.map || life.player !== initial.player || life.scene !== initial.scene)) throw Error('field-lifecycle-changed');
        if (owner.shortcut && this.options.shortcutSelection?.(owner.shortcut.request, false) !== owner.shortcut.selection) throw Error('stale-shortcut-request');
        if (owner.shortcut) {
          const source = owner.shortcut.source;
          if (actual.generation !== source.generation || life.map !== source.map || life.mapId !== source.mapId || life.player !== source.player) throw Error('shortcut-source-changed');
          if ((owner.kind === 'field-item' || !owner.shortcutMovementReleased)
            && (!life.playerPosition || life.playerPosition.x !== source.x || life.playerPosition.y !== source.y)) throw Error('shortcut-source-changed');
        }
        if (owner.kind === 'field-item' && owner.shortcut) {
          if (!actual.game.inventory.registeredItems.includes(owner.handoff.itemId)) throw Error('shortcut-not-registered');
          if (!initial?.playerPosition || !life.playerPosition || life.playerPosition.x !== initial.playerPosition.x || life.playerPosition.y !== initial.playerPosition.y) throw Error('shortcut-player-moved');
        }
        owner.lifecycle ??= life;
        const observation: NativeFieldObservation = { ...actual, owner: this.owner === owner && !owner.cancelled ? owner : null };
        return finish(observation);
      };
    });
  }
  private async runFishing(owner: HandoffOwner, action: Extract<NoTargetFieldItemAction, { kind: 'fishing' }>): Promise<FieldItemRunOutcome> {
    const port = this.options.fishing;
    if (!port) return { status: 'refused', reason: 'fishing-host-unavailable' };
    if (!this.options.atomic) return { status: 'refused', reason: 'fishing-atomic-state-unavailable' };
    const child = new FishingOperation({ owner, generation: owner.handoff.generation, action,
      observe: () => this.fishingAccess(owner, actual => ({ value: actual })),
      commitStat: (key: FishingStat, guard) => this.fishingAccess(owner, actual => {
        const next = clone(actual.game); next.stats = bumpStat(next.stats, key);
        guard(actual);
        return { value: next, next };
      }),
      facts: () => ({ ...port.facts(), business: this.facts() }),
      hasEncounterType: (type, game, content) => {
        const tables = findWorldEncounterTables(content, owner.mapId, game.world.encounterVersion);
        return Object.hasOwn(tables, type) && (tables[type]?.slots.length ?? 0) > 0;
      },
      host: port.presentation, random: this.options.random,
    });
    owner.fishing = child;
    const fishing = await child.run();
    if (fishing.status === 'cancelled') return { status: 'cancelled', fishing };
    if (fishing.status !== 'completed') return { status: fishing.status, reason: fishing.reason ?? 'fishing-failed', fishing };
    if (fishing.encounter) {
      this.fishingIntents.set(fishing.encounter, { owner, outcome: fishing, taken: false });
      try { return this.consumeFishingEncounter(owner, fishing, fishing.encounter); }
      catch (error) { return owner.cancelled ? { status: 'cancelled', fishing } : { status: 'failed', reason: why(error), fishing }; }
    }
    return { status: 'completed', itemId: owner.kind === 'field-item' ? owner.handoff.itemId : '', consumed: owner.kind === 'field-item' && owner.consumed === true, fishing };
  }
  private assertFieldEncounter(owner: FieldOwner, prepared?: PreparedWorldEncounter, allowPending = false): boolean {
    return this.fieldAccess(owner, actual => {
      if (actual.generation !== owner.permit.generation || this.notices.length && !allowPending) throw Error('stale-field-encounter');
      if (semanticFingerprint(actual.content) !== owner.contentIdentity || semanticFingerprint(actual.game.inventory.pockets) !== owner.inventoryIdentity) throw Error('field-item-stale');
      if (prepared && (semanticFingerprint(actual.game) !== prepared.stateIdentity || semanticFingerprint(actual.content) !== prepared.contentIdentity)) throw Error('field-encounter-state-changed');
      return { value: this.notices.length > 0 };
    });
  }
  private consumeFishingEncounter(owner: HandoffOwner, fishing: FishingOperationOutcome, intent: FishingEncounterIntent): FieldItemRunOutcome {
    // Only the actual completed child on this issued parent reaches this method. Intent scalars grant no authority.
    const issued = this.fishingIntents.get(intent);
    if (!issued || issued.taken || issued.owner !== owner || issued.outcome !== fishing || !owner.fishing || fishing.encounter !== intent || intent.mapId !== owner.mapId) throw Error('stale-fishing-intent');
    issued.taken = true;
    return this.consumeFieldEncounter(owner, intent.type, 'fishing', fishing);
  }
  private consumeFieldEncounter(owner: FieldOwner, type: EncounterTypeId, source: 'fishing' | 'sweet-scent' | 'rock-smash', fishing?: FishingOperationOutcome): FieldItemRunOutcome {
    for (;;) {
      const drained = this.drainNotices(false, owner, true);
      if (drained.status !== 'drained') throw Error(drained.reason ?? 'world-notice-pending');
      if (!this.assertFieldEncounter(owner, undefined, true)) break;
    }
    const before = this.options.read(); this.assertFieldEncounter(owner);
    const identity = semanticFingerprint(before);
    const current = (content?: Content): void => {
      this.assertFieldEncounter(owner);
      if (content && semanticFingerprint(content) !== owner.contentIdentity || semanticFingerprint(this.options.read()) !== identity) throw Error('field-encounter-state-changed');
      this.assertFieldEncounter(owner);
    };
    const host = source === 'fishing' ? this.options.fishing!.facts() : this.options.fieldEncounters?.read(); current();
    if (!host) throw Error('field-encounter-host-unavailable');
    const result = prepareFieldEncounter({ id: owner.permit.token, mapId: owner.mapId, type, source,
      groundEnvironment: 'groundEnvironment' in host ? host.groundEnvironment : { status: 'absent' }, facingEnvironment: 'facingEnvironment' in host ? host.facingEnvironment : { status: 'absent' } }, {
      read: this.options.read, contentView: this.options.contentView, assertCurrent: current, facts: () => this.facts(),
      random: upper => { if (!this.options.random) throw Error('no-random'); return this.options.random(upper); },
      tables: (game, content, mapId) => {
        if (!this.tables || this.runtime.currentMapId !== mapId || this.runtime.loadedVersion !== game.world.encounterVersion) {
          this.tables = findWorldEncounterTables(content, mapId, game.world.encounterVersion);
          this.runtime = { ...this.runtime, graceSteps: 0, currentMapId: mapId, loadedVersion: game.world.encounterVersion };
        }
        return clone(this.tables);
      },
      local: () => this.local, switchOn: this.options.switchOn, now: this.options.now, allowHeldItemSources: this.options.allowHeldItemSources,
    });
    current();
    if (result.status !== 'prepared') return result.status === 'unsupported' ? { status: 'refused', reason: result.reason, fishing }
      : { status: 'completed', itemId: owner.kind === 'field-item' ? owner.handoff.itemId : '', consumed: owner.kind === 'field-item' && owner.consumed === true, fishing };
    const offer: WorldBattleOffer = Object.freeze({ token: `${owner.permit.token}:battle`, generation: owner.permit.generation });
    let prepared: PreparedWorldEncounter = source === 'rock-smash' ? { ...result.prepared, onBattleStartedStat: 'rock_smash_battles' } : result.prepared;
    if (prepared.formRegistrations?.length) prepared = this.fieldAccess(owner, actual => {
      if (semanticFingerprint(actual.content) !== owner.contentIdentity) throw Error('field-item-stale');
      const registration = planInitialWildRegistration(actual.game, actual.content, prepared);
      return { value: registration.prepared, ...(registration.next ? { next: registration.next } : {}) };
    }, true);
    this.offers.set(offer, { operation: owner, prepared, taken: false });
    const admission = this.options.admit(owner.permit, offer);
    return { status: 'battle-admitted', itemId: owner.kind === 'field-item' ? owner.handoff.itemId : '', consumed: owner.kind === 'field-item' && owner.consumed === true, admission, fishing };
  }
  private fieldState(game: GameState): FieldMoveParentState {
    return { game, local: this.local, encounterRuntime: this.runtime, surf: this.surf, records: this.records };
  }
  private moveObservation(owner: FieldOwner): FieldMoveObservation {
    return this.fieldAccess(owner, actual => {
      if (semanticFingerprint(actual.content) !== owner.contentIdentity) throw Error('field-move-content-changed');
      return { value: { ...this.fieldState(actual.game), content: actual.content, generation: actual.generation, owner, mapId: actual.lifecycle.mapId } };
    });
  }
  private synchronizeMoveNotices(owner: FieldOwner, current: (actual: FieldMoveObservation) => void): FieldMoveObservation {
    let expectedGame = '', expectedTransient = '';
    const transient = (): string => semanticFingerprint({ local: this.local, encounterRuntime: this.runtime, surf: this.surf, records: this.records });
    this.fieldAccess(owner, actual => {
      const observation = { ...this.fieldState(actual.game), content: actual.content, generation: actual.generation, owner, mapId: actual.lifecycle.mapId };
      current(observation); expectedGame = semanticFingerprint(actual.game); expectedTransient = transient();
      return { value: undefined };
    });
    const sync: NoticeSynchronization = {
      before: game => { if (semanticFingerprint(game) !== expectedGame || transient() !== expectedTransient) throw Error('world-field-consumer-stale'); },
      applied: next => { expectedGame = semanticFingerprint(next); expectedTransient = transient(); },
    };
    for (;;) {
      const drained = this.drainNotices(false, owner, true, sync);
      if (drained.status !== 'drained') throw Error(drained.reason ?? 'world-field-consumer-stale');
      const observed = this.fieldAccess(owner, actual => {
        if (semanticFingerprint(actual.content) !== owner.contentIdentity || semanticFingerprint(actual.game) !== expectedGame || transient() !== expectedTransient) throw Error('world-field-consumer-stale');
        return { value: { pending: this.notices.length > 0, actual: { ...this.fieldState(actual.game), content: actual.content, generation: actual.generation, owner, mapId: actual.lifecycle.mapId } } };
      });
      if (!observed.pending) return observed.actual;
    }
  }
  private fieldEncounterFacts(owner: FieldOwner) {
    const host = this.options.fieldEncounters?.read();
    if (!host) throw Error('field-encounter-host-unavailable');
    const business = this.facts(), actual = this.moveObservation(owner);
    if (this.notices.length) throw Error('world-field-consumer-stale');
    const bool = (fact: WorldFact<boolean>): boolean => { if (fact.status !== 'value' || typeof fact.value !== 'boolean') throw Error('field-encounter-gate-unavailable'); return fact.value; };
    if (business.mapId.status !== 'value' || business.mapId.value !== owner.mapId || business.hour.status !== 'value') throw Error('field-encounter-world-unavailable');
    const tables = this.loadEncounterTables(actual.game, actual.content, owner.mapId);
    return { tables, currentType: selectOrdinaryEncounterType(tables, { surfing: actual.game.world.surfing, landAllowed: bool(host.landAllowed), hour: business.hour.value }),
      disabled: bool(host.encountersDisabled), debugControl: bool(host.debugControl), playerPresent: true, business };
  }
  private loadEncounterTables(game: GameState, content: Content, mapId: number): FormalEncounterTables {
    if (!this.tables || this.runtime.currentMapId !== mapId || this.runtime.loadedVersion !== game.world.encounterVersion) {
      this.tables = findWorldEncounterTables(content, mapId, game.world.encounterVersion);
      this.runtime = { ...this.runtime, graceSteps: 0, currentMapId: mapId, loadedVersion: game.world.encounterVersion };
    }
    return clone(this.tables);
  }
  private consumeHoney(owner: HandoffOwner): void {
    this.fieldAccess(owner, actual => {
      if (semanticFingerprint(actual.content) !== owner.contentIdentity || semanticFingerprint(actual.game.inventory.pockets) !== owner.inventoryIdentity) throw Error('field-item-stale');
      const item = itemOf(catalogOf(actual.content), owner.handoff.itemId);
      if (!item || itemQuantity(actual.game.inventory, item.id, catalogOf(actual.content)) < 1) throw Error('not-enough-items');
      const next = clone(actual.game);
      if (consumesItem(item)) next.inventory = removeItems(next.inventory, item.id, 1, catalogOf(actual.content));
      if (validateGameContent(next, actual.content).length) throw Error('invalid-field-item-state');
      owner.inventoryIdentity = semanticFingerprint(next.inventory.pockets); owner.consumed = consumesItem(item);
      return { value: undefined, next };
    });
  }
  private recordFieldMovement(owner: FieldOwner, child: FieldMoveOperation, context: object, observation: unknown,
    current: (actual: FieldMoveObservation) => void): { readonly result: import('./movement-start-ports').MovementStartResult; readonly state: FieldMoveParentState } {
    let prepared: PreparedMovementStart | undefined;
    const actual = this.fieldAccess(owner, joint => {
      if (owner.move !== child || Reflect.apply(ownsFieldMovement, child, [context]) !== true || !this.options.prepareMovement) throw Error('surf-movement-parent-unissued');
      const before = this.fieldState(joint.game); current({ ...before, owner, generation: joint.generation, content: joint.content, mapId: joint.lifecycle.mapId });
      const proof = joint.lifecycle.travelLease?.movementStart, source = owner.lifecycle?.playerPosition;
      if (!proof || proof.kind !== 'jump' || proof.parentContext !== context || !source || proof.from.x !== source.x || proof.from.y !== source.y
        || Math.abs(proof.offset.x) + Math.abs(proof.offset.y) !== 1 || joint.game.world.surfing !== true) throw Error('surf-movement-start-mismatch');
      prepared = this.options.prepareMovement(joint, observation, context);
      return { value: { result: prepared.value, state: this.fieldState(prepared.next ?? joint.game) }, ...(prepared.next ? { next: prepared.next } : {}) };
    }, true);
    if (prepared?.next) this.options.movementInstalled?.(prepared, prepared.next);
    return actual;
  }
  private settleFailedSurfLanding(owner: FieldMoveOwner): void {
    const landing = owner.landing, child = owner.move;
    if (!landing || !child || this.owner !== owner) return;
    const ticket = Object.freeze({});
    owner.terminalArrival = { ticket, entry: landing.bound.hold.entry, child };
    try {
      if (!owner.cancelled && owner.permit.generation === this.options.generation()) landing.bound.hold.arrivalOnly(ticket);
      else landing.bound.hold.cancel();
    } finally { if (owner.terminalArrival?.ticket === ticket) delete owner.terminalArrival; if (owner.landing === landing) delete owner.landing; }
  }
  private async completeOwnedSurfLanding(owner: FieldMoveOwner, child: FieldMoveOperation, outcome: FieldMoveOperationOutcome): Promise<FieldMoveRunOutcome> {
    const atomic = this.options.travelAtomic, host = this.options.fieldMoves, landing = owner.landing;
    if (!atomic || !host?.takeSurfLanding || !landing || landing.terminalOnly) throw Error('surf-landing-completion-required');
    let scope: OwnedSurfLandingStepScope | undefined;
    const operation = atomic(() => {
      if (this.owner !== owner || owner.move !== child || owner.cancelled || this.starting) throw Error('surf-landing-handoff-stale');
      const bound = host.takeSurfLanding!(landing.context, landing.receipt);
      if (bound.proof !== landing.bound.proof || bound.hold !== landing.bound.hold) throw Error('surf-landing-receipt-mismatch');
      scope = bound.hold.prepare(`surf-step:${owner.permit.token}`);
      // Normalize all possibly reentrant native values before the final interval.
      const raw = scope.step;
      const step: CompletedWorldStep = Object.freeze({ id: raw.id, hostOwner: raw.hostOwner, generation: raw.generation,
        map: raw.map, player: raw.player, mapId: raw.mapId, x: raw.x, y: raw.y, ice: raw.ice,
        regionId: raw.regionId, terrainTag: raw.terrainTag, sceneActive: raw.sceneActive });
      const created = this.createCompletedStep(step), permitted = this.options.canStartCompletedStep?.() === true && !this.options.inventory.active;
      return actual => {
        const proof = bound.proof, life = actual.lifecycle, start = proof.start;
        if (!permitted || this.owner !== owner || owner.move !== child || owner.cancelled || this.starting || owner.landing !== landing
          || actual.generation !== owner.permit.generation || created.permit.generation !== actual.generation
          || life.travelLease?.surfLanding !== proof || life.travelLease.nativeEpoch !== proof.epoch
          || life.scene !== start.scene || life.map !== start.map || life.player !== start.player || life.mapId !== start.mapId
          || life.mapData !== start.data || !life.playerPosition || life.playerPosition.x !== start.to.x || life.playerPosition.y !== start.to.y
          || step.hostOwner !== start.application || step.generation !== actual.generation || step.map !== life.map || step.player !== life.player
          || step.mapId !== life.mapId || step.x !== start.to.x || step.y !== start.to.y || step.sceneActive !== true
          || typeof step.ice !== 'boolean' || !Number.isSafeInteger(step.regionId) || step.regionId < 0
          || !Number.isSafeInteger(step.terrainTag) || step.terrainTag < 0 || step.terrainTag > 7
          || semanticFingerprint(actual.content) !== owner.contentIdentity || !this.surf.endingSurf || this.surf.surfBase === null) throw Error('surf-landing-handoff-stale');
        // No provider/validator/native gateway is called here. The old child is
        // finished; one owner-to-owner assignment transfers this exact chain.
        this.landingParents.set(created, owner); this.owner = created;
        return { value: created };
      };
    });
    const result = await this.runCompletedStep(operation);
    try { scope!.finish(result); } finally { if (owner.landing === landing) delete owner.landing; }
    return result.status === 'failed' || result.status === 'refused' || result.status === 'cancelled'
      ? { ...outcome, status: result.status === 'cancelled' ? 'cancelled' : 'failed', reason: 'reason' in result ? result.reason : 'surf-landing-step-cancelled' }
      : outcome;
  }
  private async runFieldMoveChild(owner: FieldOwner, action: FieldMoveAction): Promise<FieldMoveRunOutcome> {
    const host = this.options.fieldMoves;
    if (!host || !this.options.atomic) return { status: 'refused', reason: 'field-move-host-or-atomic-unavailable', completedStages: 0, committedUpdates: 0 };
    try {
    let initial: FieldMoveObservation;
    for (;;) {
      const drained = this.drainNotices(false, owner, true);
      if (drained.status !== 'drained') throw Error(drained.reason ?? 'world-notice-pending');
      initial = this.moveObservation(owner);
      if (!this.notices.length) break;
    }
    this.loadEncounterTables(initial.game, initial.content, owner.mapId);
    const child: FieldMoveOperation = new FieldMoveOperation({ owner, generation: owner.permit.generation, action, host,
      recordMovementStart: (context, observation, current) => this.recordFieldMovement(owner, child, context, observation, current),
      ...(action.kind === 'surf-land' && host.registerSurfLanding ? { recordLandingCompletion: (context: object, receipt: unknown, current: (actual: FieldMoveObservation) => void, terminalOnly = false) => {
        if (owner.kind !== 'field-move' || !this.options.travelAtomic) throw Error('surf-landing-parent-unavailable');
        this.options.travelAtomic(() => {
          const bound = host.registerSurfLanding!(context, receipt);
          // Keep the actual bound native hold available for terminal-only failure;
          // this private link is not D authority and is checked again in final.
          if (this.owner === owner && owner.move === child) owner.landing = { context, receipt, bound, terminalOnly };
          return actual => {
            if (this.owner !== owner || owner.move !== child || owner.cancelled || actual.generation !== owner.permit.generation
              || actual.lifecycle.travelLease?.surfLanding !== bound.proof || bound.proof.context !== context
              || semanticFingerprint(actual.content) !== owner.contentIdentity) throw Error('surf-landing-completion-stale');
            if (!terminalOnly) current({ ...this.fieldState(actual.game), owner, generation: actual.generation, content: actual.content, mapId: actual.lifecycle.mapId });
            return { value: undefined };
          };
        });
      } } : {}),
      observe: () => this.moveObservation(owner),
      commit: (update, current) => this.fieldAccess(owner, actual => {
        const before = this.fieldState(actual.game), observation = { ...before, owner, generation: actual.generation, content: actual.content, mapId: actual.lifecycle.mapId };
        current(observation);
        const next = applyFieldMoveUpdate(before, update), problems = validateGameContent(next.game, actual.content);
        if (problems.length) throw Error('invalid-field-move-state');
        this.local = clone(next.local); this.runtime = clone(next.encounterRuntime); this.surf = clone(next.surf); this.records = clone(next.records ?? []);
        // This exact stage has passed the child's issued-order check. The native Surf host already
        // owns its source scope and will validate its one legitimate jump against that scope.
        if (owner.kind === 'field-move' && owner.shortcut && action.kind === 'use' && action.moveId === 'surf'
          && update.stage.kind === 'runtime' && update.stage.surfBase !== undefined && update.stage.surfBase !== null) owner.shortcutMovementReleased = true;
        return { value: this.fieldState(next.game), next: next.game };
      }),
      synchronizeWorldNotices: current => this.synchronizeMoveNotices(owner, current),
      encounterFacts: () => this.fieldEncounterFacts(owner), random: this.options.random,
    });
    owner.move = child;
    const outcome = await child.run();
    if (outcome.status !== 'completed') return outcome;
    if (action.kind === 'surf-land' && host.takeSurfLanding) {
      if (owner.kind !== 'field-move') throw Error('surf-landing-parent-unavailable');
      try { return await this.completeOwnedSurfLanding(owner, child, outcome); }
      catch (error) { return { ...outcome, status: owner.cancelled ? 'cancelled' : 'failed', reason: why(error) }; }
    }
    try {
      if (owner.kind === 'field-item') this.consumeHoney(owner);
      if (!outcome.encounter) return outcome;
      this.moveIntents.set(outcome.encounter, { owner, outcome, taken: false });
      const issued = this.moveIntents.get(outcome.encounter)!;
      if (issued.owner !== owner || issued.outcome !== outcome || issued.taken) throw Error('stale-field-move-intent');
      issued.taken = true;
      const result = this.consumeFieldEncounter(owner, outcome.encounter.type, outcome.encounter.source);
      return result.status === 'battle-admitted' ? { ...outcome, admission: result.admission }
        : result.status === 'completed' ? outcome : { ...outcome, status: result.status === 'cancelled' ? 'cancelled' : 'failed', reason: 'reason' in result ? result.reason : 'field-encounter-failed' };
    } catch (error) { return { ...outcome, status: owner.cancelled ? 'cancelled' : 'failed', reason: why(error) }; }
    } catch (error) { return { status: owner.cancelled ? 'cancelled' : 'failed', reason: why(error), completedStages: 0, committedUpdates: 0 }; }
  }
  runShortcutMove(request: object, action: Extract<FieldMoveAction, { kind: 'use' }>): Promise<FieldMoveRunOutcome> {
    const admission = this.options.shortcutAdmission?.(request), selection = admission?.selection;
    if (!admission || !selection || selection.kind !== 'move' || selection.moveId !== action.moveId || selection.memberId !== action.memberId || !['party', 'shortcut'].includes(action.entry)) return Promise.resolve({ status: 'refused', reason: 'stale-shortcut-request', completedStages: 0, committedUpdates: 0 });
    return this.startFieldMove(`shortcut:${this.options.generation()}:${this.sequence + 1}`, action, { request, ...admission });
  }
  fieldMovePending(requestId: string): boolean { return this.owner?.kind === 'field-move' && this.owner.requestId === requestId && this.owner.running && !this.owner.cancelled; }
  runFieldMove(requestId: string, action: FieldMoveAction): Promise<FieldMoveRunOutcome> { return this.startFieldMove(requestId, action); }
  private startFieldMove(requestId: string, action: FieldMoveAction, shortcut?: ShortcutOwner): Promise<FieldMoveRunOutcome> {
    const refused = (reason: string): Promise<FieldMoveRunOutcome> => Promise.resolve({ status: 'refused', reason, completedStages: 0, committedUpdates: 0 });
    let identity: string;
    try {
      identity = semanticFingerprint(action);
      if (!action || !['use', 'strength-push', 'surf-land', 'surf-cleanup'].includes(action.kind) || typeof requestId !== 'string' || !requestId.length || requestId.length > 64) return refused('invalid-field-move-request');
      const capturedAction = clone(action);
      const old = shortcut ? this.shortcutMoves.get(shortcut.request) : this.moveRequests.get(requestId);
      if (old) return old.identity === identity ? old.owner.promise! : refused('field-move-request-conflict');
      this.flushNotices(false);
      if (this.active || !this.canStartBusiness() || this.options.inventory.active) return refused('operation-active');
      const reservation = {}, generation = this.options.generation(); this.starting = reservation;
      try {
        const lifecycle = shortcut ? this.options.lifecycle?.() : undefined;
        if (shortcut && !lifecycle?.playerPosition) throw Error('shortcut-native-source-unavailable');
        const content = this.options.content(), game = this.options.read(), facts = this.facts();
        if (this.starting !== reservation || generation !== this.options.generation() || this.owner || this.notices.length || facts.mapId.status !== 'value'
          || shortcut && this.options.shortcutSelection?.(shortcut.request, true) !== shortcut.selection) throw Error('stale-field-move-preparation');
        const owner: FieldMoveOwner = { kind: 'field-move', permit: Object.freeze({ kind: 'field-move', generation, token: `field-move:${generation}:${++this.sequence}` }), requestId,
          mapId: facts.mapId.value, contentIdentity: semanticFingerprint(content), inventoryIdentity: semanticFingerprint(game.inventory.pockets), running: true, cancelled: false, admitted: false, ...(shortcut ? { shortcut, lifecycle } : {}) };
        this.owner = owner;
        try { this.moveObservation(owner); }
        catch (error) { if (this.owner === owner) this.owner = null; throw error; }
        owner.promise = Promise.resolve().then(() => this.runFieldMoveChild(owner, capturedAction)).then(outcome => {
          if (this.owner === owner) {
            try { this.settleFailedSurfLanding(owner); }
            finally { if (this.owner === owner) this.owner = null; }
          }
          if (generation === this.options.generation()) this.flushNotices(false);
          return outcome;
        });
        if (shortcut) this.shortcutMoves.set(shortcut.request, { identity, owner }); else this.moveRequests.set(requestId, { identity, owner });
        return owner.promise;
      } finally { if (this.starting === reservation) this.starting = null; }
    } catch (error) { this.flushNotices(false); return refused(why(error)); }
  }
  setEncounterVersion(version: number): WorldOperationOutcome {
    if (!Number.isSafeInteger(version)) return { status: 'refused', reason: 'invalid-encounter-version' };
    if (this.active || !this.options.canStart() || this.options.inventory.active) return { status: 'refused', reason: 'operation-active' };
    const atomic = this.options.atomic;
    if (!atomic) return { status: 'refused', reason: 'world-atomic-unavailable' };
    const reservation = {}, generation = this.options.generation(); this.starting = reservation;
    try {
      return atomic<WorldOperationOutcome>(() => {
        const content = this.options.content(), identity = semanticFingerprint(content);
        return actual => {
          if (this.starting !== reservation || this.owner || actual.generation !== generation || this.options.generation() !== generation
            || semanticFingerprint(actual.content) !== identity) throw Error('stale-encounter-version-operation');
          if (actual.game.world.pendingReturn !== null) return { value: { status: 'refused' as const, reason: 'blackout-return-pending' } };
          if (actual.game.world.encounterVersion === version) return { value: { status: 'unchanged' as const } };
          const next = clone(actual.game); next.world.encounterVersion = version;
          if (validateGameContent(next, actual.content).length) throw Error('invalid-encounter-version-state');
          const tables = findWorldEncounterTables(actual.content, actual.lifecycle.mapId, version);
          this.tables = tables; this.runtime = { ...this.runtime, graceSteps: 0, currentMapId: actual.lifecycle.mapId, loadedVersion: version };
          return { value: { status: 'committed' as const }, next };
        };
      });
    } catch (error) { return { status: 'refused', reason: why(error) }; }
    finally { if (this.starting === reservation) this.starting = null; }
  }
  battleStarted(): void { this.runtime = { ...this.runtime, graceSteps: 0, accumulator: 0 }; }
  cancelFieldMove(requestId: string): WorldOperationOutcome {
    const owner = this.owner;
    if (owner?.kind === 'completed-step') {
      const parent = this.landingParents.get(owner);
      if (!parent || parent.requestId !== requestId || parent.permit.generation !== this.options.generation()) return { status: 'refused', reason: 'stale-field-move' };
      owner.cancel(); return { status: 'unchanged' };
    }
    if (!owner || owner.kind !== 'field-move' || owner.shortcut || owner.requestId !== requestId) return { status: 'refused', reason: 'stale-field-move' };
    owner.cancelled = true; void owner.move?.cancel(); return { status: 'unchanged' };
  }
  cancelShortcutMove(request: object): WorldOperationOutcome {
    const owner = this.shortcutMoves.get(request)?.owner;
    if (!owner || this.owner !== owner || owner.permit.generation !== this.options.generation()) return { status: 'refused', reason: 'stale-field-move' };
    owner.cancelled = true; void owner.move?.cancel(); return { status: 'unchanged' };
  }
  private commitShortcutItem(owner: HandoffOwner, before: GameState, next: GameState): void {
    this.fieldAccess(owner, actual => {
      if (semanticFingerprint(actual.game) !== semanticFingerprint(before) || semanticFingerprint(actual.content) !== owner.contentIdentity) throw Error('field-item-stale');
      if (validateGameContent(next, actual.content).length) throw Error('invalid-shortcut-item-state');
      return { value: undefined, next };
    });
  }
  private async execute(owner: HandoffOwner): Promise<FieldItemRunOutcome> {
    const current = (): void => { if (owner.cancelled) throw Error('field-item-cancelled'); if (this.owner !== owner || owner.handoff.generation !== this.options.generation()) throw Error('stale-field-item'); };
    const checkContent = (content: Content): void => { current(); if (semanticFingerprint(content) !== owner.contentIdentity) throw Error('field-item-stale'); };
    try {
      current(); if (this.options.inventory.active) throw Error('inventory-not-closed');
      if (owner.shortcut || owner.handoff.action.kind === 'escape-rope') this.fieldAccess(owner, () => ({ value: undefined }));
      let content: Content, before: GameState;
      for (;;) {
        const drained = this.drainNotices(false, owner); current();
        if (drained.status !== 'drained') throw Error(drained.reason ?? 'world-notice-pending');
        const facts = this.facts(); current();
        content = this.options.content(); before = this.options.read(); current();
        // Host/content reads can enqueue a newer observation. Include it before admitting this consumer.
        if (this.notices.length) continue;
        if (facts.mapId.status !== 'value' || facts.mapId.value !== owner.mapId) throw Error('field-map-changed');
        if (semanticFingerprint(content) !== owner.contentIdentity || semanticFingerprint(before.inventory.pockets) !== owner.inventoryIdentity) throw Error('field-item-stale');
        break;
      }
      owner.running = true;
      const catalog = catalogOf(content), item = itemOf(catalog, owner.handoff.itemId);
      if (!item || itemQuantity(before.inventory, item.id, catalog) < 1) throw Error('not-enough-items');
      const action = owner.handoff.action;
      if (action.kind === 'escape-rope') {
        const id = `field-travel:${owner.permit.generation}:${++this.sequence}`;
        this.fieldTravels.set(owner.handoff.token, { id, itemId: item.id, generation: owner.permit.generation, consumable: consumesItem(item) });
        const result = await this.travel.run(id, { kind: 'escape-rope' }, undefined, owner);
        if (result.status === 'failed') return { status: 'failed', reason: result.reason };
        if (result.status === 'cancelled') return { status: 'cancelled' };
        if (result.status === 'completed') return { status: 'completed', itemId: item.id, consumed: consumesItem(item) };
        return { status: 'travel-admitted', itemId: item.id, consumed: false, travel: result };
      }
      if (action.kind === 'fishing') return this.runFishing(owner, action);
      if (action.kind === 'sweet-scent' && this.options.fieldMoves) {
        const fieldMove = await this.runFieldMoveChild(owner, { kind: 'use', moveId: 'sweetscent', entry: 'honey' });
        if (fieldMove.status !== 'completed') return { status: fieldMove.status === 'cancelled' ? 'cancelled' : 'failed', reason: fieldMove.reason ?? 'field-move-failed', fieldMove };
        return fieldMove.admission ? { status: 'battle-admitted', itemId: item.id, consumed: owner.consumed === true, admission: fieldMove.admission, fieldMove }
          : { status: 'completed', itemId: item.id, consumed: owner.consumed === true, fieldMove };
      }
      let next: GameState;
      if (action.kind === 'flute') {
        // Project mapping: black raises levels and white lowers them; rate mode retains its formal old colors.
        const target = resolveConfig(content.settings).FLUTES_CHANGE_WILD_ENCOUNTER_LEVELS
          ? action.color === 'black' ? 'higherWildLevel' : 'lowerWildLevel'
          : action.color === 'black' ? 'lowerEncounterRate' : 'higherEncounterRate';
        const local = this.fieldAccess(owner, actual => {
          if (semanticFingerprint(actual.content) !== owner.contentIdentity || semanticFingerprint(actual.game) !== semanticFingerprint(before)) throw Error('field-item-stale');
          const nextLocal = { ...this.local, [target]: true };
          if (!consumesItem(item)) return { value: nextLocal };
          const next = clone(actual.game); next.inventory = removeItems(next.inventory, item.id, 1, catalogOf(actual.content));
          if (validateGameContent(next, actual.content).length) throw Error('invalid-flute-state');
          return { value: nextLocal, next };
        }, true);
        // The native atomic return and this local assignment have no provider/host callback between them.
        this.local = local;
        return { status: 'completed', itemId: item.id, consumed: consumesItem(item) };
      }
      if (action.kind === 'repel') {
        if (before.world.repelSteps > 0) return { status: 'refused', reason: 'repel-active' };
        next = clone(before); next.world.repelSteps = action.steps; next.stats = bumpStat(next.stats, 'repel_count');
      } else if (action.kind === 'sacred-ash') {
        const planned = planItemUse(before, content, { itemId: item.id, quantity: 1 });
        if (planned.status !== 'ready') return { status: 'refused', reason: 'field-item-not-ready' };
        current(); if (owner.shortcut) this.commitShortcutItem(owner, before, planned.state); else this.options.install(planned.state, checkContent); current(); return { status: 'completed', itemId: item.id, consumed: consumesItem(item) };
      } else {
        const handler = this.options.fieldItems; if (!handler) return { status: 'refused', reason: 'field-handler-unavailable' };
        const result = await handler.execute({ owner: Object.freeze({ token: owner.handoff.token, generation: owner.handoff.generation }), itemId: item.id, action: clone(action), entry: owner.handoff.entry, initialMapId: owner.mapId, assertCurrent: current });
        current();
        if (!result || typeof result !== 'object' || !['completed', 'cancelled', 'refused', 'failed'].includes(result.status) || (result.status === 'refused' || result.status === 'failed') && typeof result.reason !== 'string') throw Error('invalid-field-handler-result');
        if (result.status !== 'completed') return clone(result);
        const latest = this.options.read();
        if (semanticFingerprint(this.options.content()) !== owner.contentIdentity || semanticFingerprint(latest.inventory.pockets) !== owner.inventoryIdentity) throw Error('field-item-stale');
        next = clone(latest);
      }
      current(); if (consumesItem(item)) next.inventory = removeItems(next.inventory, item.id, 1, catalog);
      if (owner.shortcut) this.commitShortcutItem(owner, before, next); else this.options.install(next, checkContent); current(); return { status: 'completed', itemId: item.id, consumed: consumesItem(item) };
    } catch (e) { return owner.cancelled ? { status: 'cancelled' } : { status: 'failed', reason: why(e) }; }
  }
}
