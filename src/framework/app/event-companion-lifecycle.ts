/** Companion runtime transitions owned by the real App, after genuine native/parent installs. */
import { semanticFingerprint } from '../rules/semantic';
import { planCompanionTransfer } from '../rules/event-companions';
import { validateGameContent } from '../rules/save-schema';
import type { GameState } from '../rules/state';
import type { WorldTravelLeaseSource } from './ports';
import type { MovementStartAtomic } from './movement-start-application';
import type { CompanionResult } from './event-companion-operation';
import type { CompanionRuntimePresentation } from './companion-lifecycle-data';
import type { WorldFact } from '../rules/world-data';

interface Applied { readonly generation: number; readonly game: GameState; readonly identity: string }
const failed = (reason: string): CompanionResult => ({ status: 'failed', reason });
export class CompanionLifecycle {
  readonly #application: object; readonly #registry: WorldTravelLeaseSource | null; readonly #atomic: MovementStartAtomic | undefined;
  readonly #applied = new WeakMap<object, Applied>();
  #generation: number; #revision = 0; #hidden: readonly string[] = []; #turn = false; #committing = false;
  constructor(application: object, registry: WorldTravelLeaseSource | null, atomic: MovementStartAtomic | undefined, generation: number) {
    this.#application = application; this.#registry = registry; this.#atomic = atomic; this.#generation = generation;
  }
  presentation(): CompanionRuntimePresentation { return Object.freeze({ generation: this.#generation, revision: this.#revision,
    transferHidden: Object.freeze([...this.#hidden]), turnTowardPlayer: this.#turn }); }
  /** Internal installed-parent calls only. The owning GameApp keeps this service private. */
  installedTransfer(hidden: readonly string[], generation: number): void {
    if (generation !== this.#generation || !hidden.every(id => typeof id === 'string')) return;
    this.#hidden = Object.freeze([...hidden]); this.#turn = false; this.#revision++;
  }
  installedStart(generation: number): void {
    if (generation !== this.#generation) return;
    this.#hidden = []; this.#turn = true; this.#revision++;
  }
  /** The actual service's already-installed removal may retain only current identities. */
  retainedHidden(hidden: readonly string[], generation: number): void {
    if (generation !== this.#generation || hidden.length === this.#hidden.length && hidden.every((id, index) => id === this.#hidden[index])) return;
    this.#hidden = Object.freeze([...hidden]); this.#revision++;
  }
  currentBirth(candidate: unknown): WorldFact<object> {
    if (!this.#atomic || !this.#registry) return { status: 'unavailable', reason: 'companion-map-capability-unavailable' };
    try { return this.#atomic<WorldFact<object>>(() => actual => {
      const life = actual.lifecycle, snapshot = life.travelLease, birth = snapshot?.mapBirth, frame = birth?.frame, transition = life.sceneTransition;
      if (actual.generation !== this.#generation || snapshot?.registry !== this.#registry || snapshot.current !== null || snapshot.sourceHandoff
        || !birth || birth.birth !== candidate || !frame || !transition || birth.scene !== life.scene || birth.manager !== transition.manager
        || frame.map !== life.map || frame.mapId !== life.mapId || frame.player !== life.player || frame.data !== life.mapData
        || transition.started !== true || transition.nextScene !== null || life.travelPlayer?.transferring !== false)
        return { value: { status: 'unavailable', reason: 'companion-map-source-not-ready' } };
      return { value: { status: 'value', value: birth.birth } };
    }); } catch { return { status: 'unavailable', reason: 'companion-map-source-not-ready' }; }
  }
  /** The body commits synchronously, before its returned Promise and native Map.start/autosave. */
  transfer(observation: unknown): Promise<CompanionResult> {
    const atomic = this.#atomic;
    if (!atomic || !this.#registry) return Promise.resolve(failed('companion-transfer-capability-unavailable'));
    if (this.#committing) return Promise.resolve(failed('companion-transfer-reentered'));
    this.#committing = true;
    let installed: GameState | null = null, hidden: readonly string[] | null = null, generation: number | null = null, issued: object | null = null;
    try {
      const result = atomic<CompanionResult>(() => actual => {
        const life = actual.lifecycle, snapshot = life.travelLease, proof = snapshot?.companionTransfer;
        if (!proof || snapshot?.registry !== this.#registry || proof.observation !== observation || proof.application !== this.#application
          || proof.generation !== actual.generation || this.#generation !== actual.generation || snapshot.current !== null || snapshot.sourceHandoff
          || proof.epoch !== snapshot.nativeEpoch) throw Error('companion-transfer-unissued');
        const birth = snapshot.mapBirth, frame = birth?.frame, transition = life.sceneTransition, point = life.playerPosition;
        if (!birth || !frame || birth.birth !== proof.birth || birth.queue !== proof.queue || birth.manager !== proof.manager || birth.scene !== proof.scene
          || frame.map !== proof.map || frame.mapId !== proof.mapId || frame.player !== proof.player || frame.data !== proof.data
          || life.map !== proof.map || life.mapId !== proof.mapId || life.player !== proof.player || life.scene !== proof.scene || life.mapData !== proof.data
          || !transition || transition.manager !== proof.manager || transition.nextScene !== null || life.travelPlayer?.transferring !== false
          || point?.x !== proof.target.x || point.y !== proof.target.y || proof.target.mapId !== proof.mapId || life.travelPlayer.direction !== proof.target.direction)
          throw Error('companion-transfer-source-changed');
        if (actual.content !== proof.content || semanticFingerprint(actual.content) !== proof.contentIdentity) throw Error('companion-transfer-content-changed');
        const previous = this.#applied.get(proof.observation);
        if (previous) return { value: previous.generation === actual.generation && previous.game === actual.game && previous.identity === semanticFingerprint(actual.game)
          ? { status: 'duplicate', diagnostics: [] } : failed('companion-transfer-receipt-stale') };
        if (actual.game !== proof.game || semanticFingerprint(actual.game) !== proof.gameIdentity) throw Error('companion-transfer-state-changed');
        const plan = planCompanionTransfer(actual.game.world.companions, proof.target);
        const next: GameState = { ...actual.game, world: { ...actual.game.world, companions: plan.companions } };
        if (validateGameContent(next, actual.content).length) throw Error('companion-transfer-invalid-state');
        if (!Number.isSafeInteger(this.#revision + 1)) throw Error('companion-runtime-revision-exhausted');
        installed = next; hidden = plan.transferHidden; generation = actual.generation; issued = proof.observation;
        return { next, value: { status: 'completed', diagnostics: [] } };
      });
      // Assignment failure cannot consume the once record or alter runtime visibility.
      if (installed && hidden && generation !== null && issued) {
        this.#applied.set(issued, { generation, game: installed, identity: semanticFingerprint(installed) });
        this.installedTransfer(hidden, generation);
      }
      return Promise.resolve(result);
    } catch (error) { return Promise.resolve(failed(error instanceof Error ? error.message : String(error))); }
    finally { this.#committing = false; }
  }
  invalidate(generation: number): void { this.#generation = generation; this.#hidden = []; this.#turn = false; this.#revision = 0; }
}
