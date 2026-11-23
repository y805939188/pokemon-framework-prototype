/** The completed-step consumer. WorldOperation owns its lifetime; this leaf never acquires another global lock. */
import { OwnedRepelScene } from './owned-repel-scene';
import { clone } from '../rules/value';
import { semanticFingerprint } from '../rules/semantic';
import { catalogOf, hasFlag, itemOf } from '../rules/item-catalog';
import { itemQuantity, removeItems } from '../rules/inventory';
import { classifyFieldItem } from '../rules/field-items';
import { beginFieldPoison, planCompletedFieldStep, planNextFieldPoison } from '../rules/field-passives';
import { resolveConfig } from '../rules/config';
import { bumpStat } from '../rules/stats';
import type { Content } from '../rules/types';
import type { GameState } from '../rules/state';
import type { InventorySession } from './inventory-session';
import type {
  CompletedWorldStep, CompletedStepHostPort, CompletedStepPermit, CompletedWorldStepOutcome,
  CompletedStepPrefix, CompletedStepPresentation, OwnedRepelSelection, RepelSelectionPermit, RandomPort,
  WorldBattleAdmission, OwnedRepelSceneHooks, WorldHostLifecycle,
} from './ports';

interface Options {
  read(): GameState; content(): Content; generation(): number; owns(operation: CompletedStepOperation): boolean;
  install(next: GameState, current: (actualContent: Content) => void): void;
  inventory: InventorySession; host: CompletedStepHostPort; random?: RandomPort;
  ordinary?(operation: CompletedStepOperation, installRegistration: (next: GameState) => void): { status: 'battle-admitted'; admission: WorldBattleAdmission } | { status: 'no-encounter' | 'unsupported'; reason: string };
  /** Pure World-owned gate; pending notifications never suppress arrival but forbid every encounter mode. */
  ordinaryBlocked?(): boolean;
  /** Trusted World parent only. The child shares this owner; host ports never receive these writers. */
  afterStep?(operation: CompletedStepOperation, state: CompletedStepHandlerState): Promise<void>;
  nativeCurrent?(): void;
  lifecycle?(): WorldHostLifecycle;
  canRetireScene?(): boolean;
}
export interface CompletedStepHandlerState {
  /** Pure final check against the exact already-committed prefix. */
  current(game: GameState, content: Content): void;
  /** Only after the parent's atomic writer actually installed its issued child update. */
  installed(game: GameState): void;
}
const why = (error: unknown): string => error instanceof Error ? error.message : String(error);
const object = (value: unknown): value is object => value !== null && typeof value === 'object';
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
type PresentationIntent = CompletedStepPresentation extends infer P ? P extends CompletedStepPresentation ? Omit<P, 'id'> : never : never;

export function sameCompletedStep(a: CompletedWorldStep, b: CompletedWorldStep): boolean {
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  return a.id === b.id && a.hostOwner === b.hostOwner && a.player === b.player && a.map === b.map &&
    a.generation === b.generation && a.mapId === b.mapId && a.x === b.x && a.y === b.y &&
    a.ice === b.ice && a.regionId === b.regionId && a.terrainTag === b.terrainTag && a.sceneActive === b.sceneActive;
}

export class CompletedStepOperation {
  readonly kind = 'completed-step';
  readonly running = true;
  readonly permit: CompletedStepPermit;
  readonly step: CompletedWorldStep;
  cancelled = false;
  contentIdentity: string | undefined;
  private stateIdentity: string | undefined;
  private invalid: string | null = null;
  private child: RepelSelectionPermit | null = null;
  private selection: OwnedRepelSelection | null = null;
  private scene: OwnedRepelScene | null = null;
  private effectId = 0;
  private dispatchingArrival = false;
  private readonly prefix: { -readonly [K in keyof CompletedStepPrefix]: CompletedStepPrefix[K] } = {
    stepCommitted: false, repelRenewed: false, poisonMembersCommitted: 0, repelActiveAtStart: false,
  };
  private readonly options: Options;
  promise?: Promise<CompletedWorldStepOutcome>;
  admitted = false;
  get repelWasActive(): boolean { return this.prefix.repelActiveAtStart; }
  /** Read-only answer for the native action gate, only inside this exact arrival call. */
  isOwnedArrival(owner: CompletedStepPermit, id: string): boolean {
    if (!this.dispatchingArrival || owner !== this.permit || id !== this.step.id) return false;
    try {
      this.active();
      const here = this.options.host.current(); this.active();
      const content = this.options.content(); this.active();
      const game = this.options.read(); this.active();
      const step = this.step;
      if (!here || here.hostOwner !== step.hostOwner || here.player !== step.player || here.map !== step.map ||
        here.generation !== step.generation || here.mapId !== step.mapId || here.x !== step.x || here.y !== step.y ||
        semanticFingerprint(game) !== this.stateIdentity || semanticFingerprint(content) !== this.contentIdentity) return false;
      this.options.nativeCurrent?.();
      if (this.scene) this.scene.assert(this.options.lifecycle!());
      this.active();
      return this.dispatchingArrival;
    } catch { return false; }
  }
  constructor(step: CompletedWorldStep, token: string, options: Options) {
    this.step = Object.freeze({ ...step }); this.options = options;
    this.permit = Object.freeze({ kind: 'completed-step', token, generation: options.generation() });
  }
  private active(): void {
    if (this.cancelled) throw Error('completed-step-cancelled');
    if (this.invalid) throw Error(this.invalid);
    if (!this.options.owns(this) || this.options.generation() !== this.permit.generation) throw Error('stale-completed-step');
  }
  /** Observe each supported boundary; observing a mismatch permanently retires this continuation, including ABA. */
  assertCurrent(actualContent?: Content): { game: GameState; content: Content } {
    try {
      this.active();
      const here = this.options.host.current(); this.active();
      const step = this.step;
      if (!here || here.hostOwner !== step.hostOwner || here.player !== step.player || here.map !== step.map ||
        here.generation !== step.generation || here.mapId !== step.mapId || here.x !== step.x || here.y !== step.y) throw Error('completed-step-location-changed');
      const content = actualContent ?? this.options.content(); this.active();
      const game = this.options.read(); this.active();
      const stateIdentity = semanticFingerprint(game), contentIdentity = semanticFingerprint(content);
      if (this.stateIdentity !== undefined && stateIdentity !== this.stateIdentity) throw Error('completed-step-state-changed');
      if (this.contentIdentity !== undefined && contentIdentity !== this.contentIdentity) throw Error('completed-step-content-changed');
      this.stateIdentity = stateIdentity; this.contentIdentity = contentIdentity; this.active(); this.options.nativeCurrent?.();
      if (this.scene) this.scene.assert(this.options.lifecycle!());
      this.active();
      return { game, content };
    } catch (error) { this.invalid ??= why(error); throw error; }
  }
  assertRepelChild(child: object): void {
    if (this.child !== child) throw Error('stale-world-selection');
    this.assertCurrent();
  }
  isOwnedSelection(owner: CompletedStepPermit, selection: OwnedRepelSelection): boolean {
    try {
      if (owner !== this.permit || selection !== this.selection || selection.child !== this.child) return false;
      this.assertRepelChild(selection.child); return true;
    } catch { return false; }
  }
  ownedSceneHooks(owner: CompletedStepPermit, selection: OwnedRepelSelection): Readonly<OwnedRepelSceneHooks> | null {
    if (!this.isOwnedSelection(owner, selection) || !this.options.lifecycle) return null;
    if (!this.scene) this.scene = new OwnedRepelScene(this.options.lifecycle(), this.step, this.options.lifecycle, () => { this.assertCurrent(); }, () => this.options.generation() === this.permit.generation && this.options.canRetireScene?.() === true);
    return this.scene.hooks;
  }
  acceptsNativeScene(actual: WorldHostLifecycle, source: object): boolean { return this.scene ? this.scene.accepts(actual) : actual.scene === source; }
  cancel(): CompletedWorldStepOutcome { this.cancelled = true; this.closeSelection(); return this.result({ status: 'cancelled' }); }
  private closeSelection(): void {
    if (this.child) this.options.inventory.endWorldRepelSelection(this.child);
    this.scene?.close();
    this.child = null; this.selection = null;
  }
  private commit(next: GameState, accepted: () => void): void {
    this.assertCurrent();
    this.options.install(next, actualContent => { this.assertCurrent(actualContent); });
    this.stateIdentity = semanticFingerprint(next);
    accepted();
    this.assertCurrent();
  }
  private result<const T extends Omit<CompletedWorldStepOutcome, 'prefix'>>(outcome: T): T & { prefix: CompletedStepPrefix } {
    return { ...outcome, prefix: { ...this.prefix } };
  }
  private async present(effect: PresentationIntent): Promise<void> {
    this.assertCurrent();
    const request = Object.freeze({ ...effect, id: ++this.effectId }) as CompletedStepPresentation;
    const ack = await this.options.host.present(Object.freeze({ owner: this.permit, effect: request }));
    this.assertCurrent();
    if (!ack || ack.id !== request.id || ack.status !== 'completed') throw Error(ack?.status === 'failed' ? ack.reason : 'invalid-completed-step-ack');
  }
  private async renewRepel(): Promise<void> {
    this.child = Object.freeze({ kind: 'repel-selection', token: `${this.permit.token}:repel`, generation: this.permit.generation });
    try {
      const issued = this.options.inventory.beginWorldRepelSelection(this.child);
      this.selection = Object.freeze({ child: this.child, inventoryToken: issued.token, selectionId: issued.selectionId });
      const reply = await this.options.host.openRepelSelection(Object.freeze({ owner: this.permit, selection: this.selection }));
      this.assertCurrent();
      if (!reply || typeof reply !== 'object') throw Error('invalid-repel-reply');
      if (reply.status === 'cancelled') return;
      if (reply.status !== 'selected') throw Error('invalid-repel-reply');
      const { game, content } = this.options.inventory.captureWorldRepelTicket(this.child, issued.token, reply.ticket);
      this.assertCurrent(content);
      const catalog = catalogOf(content), item = itemOf(catalog, reply.ticket.itemId), action = item && classifyFieldItem(item);
      if (!item || !hasFlag(item, 'Repel') || action?.kind !== 'repel') throw Error('invalid-repel-item');
      if (game.world.repelSteps !== 0 || itemQuantity(game.inventory, item.id, catalog) < 1) throw Error('repel-selection-stale');
      const next = clone(game);
      next.inventory = removeItems(next.inventory, item.id, 1, catalog);
      next.world.repelSteps = action.steps;
      next.stats = bumpStat(next.stats, 'repel_count');
      this.commit(next, () => { this.prefix.repelRenewed = true; });
    } finally { this.closeSelection(); }
  }
  async run(): Promise<CompletedWorldStepOutcome> {
    try {
      const step = this.step;
      if (!step || typeof step.id !== 'string' || !step.id.length || step.id.length > 128 || !object(step.hostOwner) ||
        !object(step.player) || !object(step.map) || !integer(step.generation) || !integer(step.mapId) || step.mapId === 0 ||
        !integer(step.x) || !integer(step.y) || !integer(step.regionId) || !integer(step.terrainTag) || typeof step.ice !== 'boolean' || step.sceneActive !== true) {
        return this.result({ status: 'refused', reason: 'invalid-completed-step' });
      }
      const { game, content } = this.assertCurrent(), config = resolveConfig(content.settings);
      const friendship = { mapId: step.mapId, AFFECTION_EFFECTS: config.AFFECTION_EFFECTS };
      const catalog = catalogOf(content);
      const hasRepelItems = game.inventory.pockets.some(pocket => pocket.some(slot => slot.quantity > 0 && hasFlag(itemOf(catalog, slot.itemId)!, 'Repel')));
      const planned = planCompletedFieldStep({ steps: game.steps, world: game.world, party: game.party,
        ice: step.ice, hasRepelItems, friendship }, upperBound => {
        this.assertCurrent();
        if (!this.options.random) throw Error('no-random');
        const value = this.options.random(upperBound); this.assertCurrent(); return value;
      });
      const next = clone(game); next.steps = planned.steps; next.party = planned.party;
      next.world.happinessSteps = planned.world.happinessSteps; next.world.repelSteps = planned.world.repelSteps;
      this.prefix.repelActiveAtStart = planned.repelActiveAtStart;
      this.commit(next, () => { this.prefix.stepCommitted = true; });
      if (this.options.afterStep) {
        await this.options.afterStep(this, {
          current: (actual, actualContent) => {
            this.active();
            if (semanticFingerprint(actual) !== this.stateIdentity || semanticFingerprint(actualContent) !== this.contentIdentity) throw Error('completed-step-handler-prefix-changed');
          },
          installed: actual => { this.active(); this.stateIdentity = semanticFingerprint(actual); },
        });
        this.assertCurrent();
      }
      if (planned.repelExpiry === 'renewal-choice') await this.renewRepel();
      else if (planned.repelExpiry === 'notice') await this.present({ kind: 'repel-expired' });
      let current = this.assertCurrent().game;
      const poison = beginFieldPoison(current.steps, current.party, config);
      if (poison.kind === 'active') {
        let continuation = poison.continuation;
        for (;;) {
          current = this.assertCurrent().game;
          const stage = planNextFieldPoison(continuation, current.party, friendship);
          if (stage.kind === 'finished') {
            if (stage.handled) return this.result({ status: 'blackout-required' });
            break;
          }
          if (stage.kind === 'feedback') await this.present({ kind: 'poison-feedback' });
          else {
            const memberNext = clone(current); memberNext.party = stage.party;
            this.commit(memberNext, () => { this.prefix.poisonMembersCommitted++; });
            if (stage.message !== 'none') await this.present({ kind: 'poison-message', memberId: stage.memberId, message: stage.message });
            if (stage.blackout) return this.result({ status: 'blackout-required' });
          }
          continuation = stage.continuation;
        }
      }
      this.assertCurrent();
      this.dispatchingArrival = true;
      let arrival: ReturnType<CompletedStepHostPort['dispatchArrival']>;
      try { arrival = this.options.host.dispatchArrival(Object.freeze({ owner: this.permit, step })); }
      finally { this.dispatchingArrival = false; }
      this.assertCurrent();
      if (!arrival || !['event-dispatched', 'action-dispatched', 'ordinary-opportunity', 'blocked', 'failed'].includes(arrival.status) ||
        (arrival.status === 'blocked' || arrival.status === 'failed') && typeof arrival.reason !== 'string') throw Error('invalid-arrival-ack');
      if (arrival.status === 'ordinary-opportunity') {
        if (this.options.ordinaryBlocked?.()) return this.result({ status: 'no-encounter', reason: 'world-notice-pending' });
        if (!this.options.ordinary) return this.result({ status: 'ordinary-unhandled', reason: 'ordinary-encounter-handler-unavailable' });
        // This one-use closure exists only during the trusted synchronous World consumer, never on a host DTO.
        let registrationOpen = true, registrationUsed = false;
        try {
          return this.result(this.options.ordinary(this, next => {
            if (!registrationOpen || registrationUsed) throw Error('stale-initial-wild-registration');
            registrationUsed = true; this.commit(next, () => {});
          }));
        } finally { registrationOpen = false; }
      }
      if (arrival.status === 'failed') return this.result({ status: 'failed', reason: arrival.reason });
      return this.result({ status: 'completed', arrival: clone(arrival) });
    } catch (error) {
      return this.cancelled ? this.result({ status: 'cancelled' }) : this.result({ status: 'failed', reason: why(error) });
    } finally { this.closeSelection(); }
  }
}
