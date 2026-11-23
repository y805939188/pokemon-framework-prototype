/** App distance consumer. Native issuer membership and distance policy remain separate. */
import { semanticFingerprint } from '../rules/semantic';
import { bumpStat } from '../rules/stats';
import { validateGameContent } from '../rules/save-schema';
import { movementDistanceDelta } from '../rules/movement-distance';
import type { GameState } from '../rules/state';
import type { AtomicFieldQueryState, AtomicStateResult, WorldTravelLeaseSource } from './ports';
import type { MovementStartResult, WorldMovementStartLifecycle } from './movement-start-ports';
export type MovementStartAtomic = <T>(prepare: () => (actual: AtomicFieldQueryState & { readonly generation: number }) => AtomicStateResult<T>) => T;
export interface PreparedMovementStart extends AtomicStateResult<MovementStartResult> {
  /** App-created installation receipt, consumed only after a successful parent assignment. */
  readonly receipt?: Readonly<{ permit: object; generation: number; observation: object }>;
}
interface Applied { readonly generation: number; readonly observation: object; readonly game: GameState; readonly fingerprint: string }
const refused = (reason: string): MovementStartResult => ({ status: 'refused', reason });
const unavailable = (reason: string): MovementStartResult => ({ status: 'unavailable', reason });
const integer = (n: number): boolean => Number.isSafeInteger(n);
export class MovementStartApplication {
  readonly #application: object; readonly #registry: WorldTravelLeaseSource | null; readonly #atomic: MovementStartAtomic | undefined;
  readonly #applied = new WeakMap<object, Applied>();
  #recording = false;
  readonly #installed: ((generation: number) => void) | undefined;
  constructor(application: object, registry: WorldTravelLeaseSource | null, atomic: MovementStartAtomic | undefined, installed?: (generation: number) => void) {
    this.#application = application; this.#registry = registry; this.#atomic = atomic;
    this.#installed = installed;
  }
  private frame(actual: AtomicFieldQueryState & { readonly generation: number }, proof: WorldMovementStartLifecycle): boolean {
    const life = actual.lifecycle, snapshot = life.travelLease, birth = snapshot?.mapBirth, transition = life.sceneTransition;
    const target = snapshot?.registry === this.#registry && proof.application === this.#application && proof.generation === actual.generation
      && life.map === proof.map && life.mapId === proof.mapId && life.player === proof.player && life.scene === proof.scene && life.mapData === proof.data
      && life.playerPosition?.x === proof.to.x && life.playerPosition.y === proof.to.y && life.travelPlayer?.transferring === false
      && transition?.manager === proof.manager && transition.nextScene === null
      && birth?.birth === proof.birth && birth.queue === proof.queue && birth.manager === proof.manager && birth.scene === proof.scene;
    if (!target) return false;
    if (proof.kind === 'connection') {
      const physical = snapshot?.current;
      return !!physical && physical.receipt === proof.parentContext && physical.lease === proof.physicalLease && physical.serial === proof.physicalSerial
        && physical.player === proof.player && physical.scene === proof.scene && physical.phase === 'arrived'
        && (!birth?.frame || birth.frame.map === proof.map && birth.frame.mapId === proof.mapId && birth.frame.player === proof.player && birth.frame.data === proof.data);
    }
    return snapshot?.current === null && transition?.started === true
      && birth?.frame?.map === proof.map && birth.frame.mapId === proof.mapId && birth.frame.player === proof.player && birth.frame.data === proof.data;
  }
  private distance(proof: WorldMovementStartLifecycle): number | null {
    const { from, to, geometry } = proof;
    if (![from.x, from.y, to.x, to.y, geometry.width, geometry.height].every(integer) || geometry.width <= 0 || geometry.height <= 0
      || ![0, 1, 2, 3].includes(geometry.scrollType)) return null;
    if (proof.kind === 'connection') return Number.isSafeInteger(proof.sourceMapId) && proof.sourceMapId > 0 ? 1 : null;
    if (proof.kind === 'jump') {
      const { x, y } = proof.offset;
      if (!integer(x) || !integer(y) || x === 0 && y === 0 || to.x - from.x !== x || to.y - from.y !== y) return null;
      const distance = Math.abs(x) + Math.abs(y);
      return Number.isSafeInteger(distance) ? distance : null;
    }
    const direction = proof.direction;
    if (direction !== 2 && direction !== 4 && direction !== 6 && direction !== 8) return null;
    let x = from.x + (direction === 6 ? 1 : direction === 4 ? -1 : 0), y = from.y + (direction === 2 ? 1 : direction === 8 ? -1 : 0);
    if (geometry.scrollType === 2 || geometry.scrollType === 3) x = (x % geometry.width + geometry.width) % geometry.width;
    if (geometry.scrollType === 1 || geometry.scrollType === 3) y = (y % geometry.height + geometry.height) % geometry.height;
    return x === to.x && y === to.y ? 1 : null;
  }
  /** Trusted App/World parent consumer, always paired with its own private context/phase guard.
   * This pure method never grants parent membership by inspecting a DTO or invoking a provider. */
  prepareOwned(actual: AtomicFieldQueryState & { readonly generation: number }, observation: unknown, parentContext: object): PreparedMovementStart {
    return this.prepare(actual, observation, parentContext);
  }
  private prepare(actual: AtomicFieldQueryState & { readonly generation: number }, observation: unknown, parentContext?: object): PreparedMovementStart {
    const snapshot = actual.lifecycle.travelLease, proof = snapshot?.movementStart;
    if (!snapshot || !proof || snapshot.registry !== this.#registry) return { value: unavailable('movement-start-proof-unavailable') };
    if (proof.parentContext !== parentContext || !parentContext && proof.kind === 'connection') return { value: refused('movement-start-parent-context-changed') };
    // The public argument is never traversed. Proxy/clone/DTO input cannot acquire membership.
    if (proof.observation !== observation || !this.frame(actual, proof)) return { value: refused('movement-start-source-changed') };
    if (actual.content !== proof.content || semanticFingerprint(actual.content) !== proof.contentIdentity) return { value: refused('movement-start-content-changed') };
    const previous = this.#applied.get(proof.permit);
    if (previous) return { value: previous.generation === actual.generation && previous.observation === observation
      && previous.game === actual.game && previous.fingerprint === semanticFingerprint(actual.game)
      ? { status: 'duplicate' } : refused('movement-start-receipt-stale') };
    if (actual.game !== proof.game || semanticFingerprint(actual.game) !== proof.gameIdentity) return { value: refused('movement-start-state-changed') };
    if (actual.game.world.surfing !== proof.mode.surfing) return { value: refused('movement-start-surfing-changed') };
    const distance = this.distance(proof);
    if (distance === null) return { value: unavailable('movement-start-displacement-unavailable') };
    const planned = movementDistanceDelta(distance, proof.mode);
    if (planned.status !== 'value') return { value: unavailable(planned.reason) };
    let stats = actual.game.stats;
    for (const key of ['distance_walked', 'distance_cycled', 'distance_surfed', 'distance_slid_on_ice'] as const) stats = bumpStat(stats, key, planned.delta[key]);
    const next = { ...actual.game, stats };
    if (validateGameContent(next, actual.content).length) return { value: refused('movement-start-invalid-state') };
    return { value: { status: 'counted', delta: planned.delta }, next,
      receipt: Object.freeze({ permit: proof.permit, generation: actual.generation, observation: proof.observation }) };
  }
  /** After native assignment only. Parent supplies the actually installed final game (including B). */
  installed(prepared: PreparedMovementStart, game: GameState): void {
    const receipt = prepared.receipt;
    if (receipt && prepared.value.status === 'counted') {
      this.#applied.set(receipt.permit, { generation: receipt.generation, observation: receipt.observation, game, fingerprint: semanticFingerprint(game) });
      this.#installed?.(receipt.generation);
    }
  }
  record(observation: unknown): MovementStartResult {
    const atomic = this.#atomic;
    if (!atomic || !this.#registry) return unavailable('movement-start-atomic-source-unavailable');
    if (this.#recording) return refused('movement-start-reentrant');
    this.#recording = true;
    let installed: PreparedMovementStart | undefined;
    try {
      const result = atomic<MovementStartResult>(() => actual => {
        const prepared = this.prepare(actual, observation);
        if (prepared.next) installed = prepared;
        return prepared;
      });
      // Native assignment and return are callback-free. Failed installs do not poison the once book.
      if (installed?.next) this.installed(installed, installed.next);
      return result;
    } catch { return refused('movement-start-atomic-rejected'); }
    finally { this.#recording = false; }
  }
}
