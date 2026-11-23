/** A single actual native Inventory push/pop belonging to one completed-step child. */
import type { CompletedWorldStep, OwnedRepelSceneHooks, WorldHostLifecycle, WorldSceneTransition } from './ports';

export class OwnedRepelScene {
  private handle: object | null = null;
  private inventory: object | null = null;
  private target: object | null = null;
  private phase: 'opening' | 'inventory' | 'popping' | 'returning' | 'returned' = 'opening';
  private closed = false;
  private failed = false;
  readonly hooks: Readonly<OwnedRepelSceneHooks>;
  private readonly source: WorldHostLifecycle;
  private readonly transition: WorldSceneTransition;
  private readonly step: CompletedWorldStep;
  private readonly observe: () => WorldHostLifecycle;
  private readonly current: () => void;
  private readonly canRetire: () => boolean;
  constructor(source: WorldHostLifecycle, step: CompletedWorldStep, observe: () => WorldHostLifecycle, current: () => void, canRetire: () => boolean) {
    if (!source.sceneTransition || source.sceneTransition.nextScene !== null || !source.sceneTransition.started) throw Error('owned-repel-scene-unavailable');
    this.source = source; this.transition = source.sceneTransition; this.step = step; this.observe = observe; this.current = current; this.canRetire = canRetire;
    this.hooks = Object.freeze({
      opened: (handle: object, scene: object) => this.attempt(() => {
        if (this.phase !== 'opening' || this.handle) return false;
        const first = this.observe(), before = this.base(first);
        if (first.scene !== this.source.scene || before.nextScene !== scene || scene === this.source.scene) throw Error('owned-repel-push-mismatch');
        this.handle = handle; this.inventory = scene; this.phase = 'inventory';
        this.current(); const actual = this.observe(), t = this.base(actual);
        if (actual.scene !== this.source.scene || t.nextScene !== scene) throw Error('owned-repel-push-changed');
        return true;
      }),
      beforeReturn: (handle: object, scene: object) => this.closed ? this.retire(handle, scene) : this.attempt(() => {
        if (this.phase !== 'inventory' || handle !== this.handle || scene !== this.inventory) return false;
        this.current(); const actual = this.observe(), t = this.base(actual);
        if (actual.scene !== scene || t.nextScene !== null) throw Error('owned-repel-return-source-changed');
        this.phase = 'popping'; return true;
      }),
      returnQueued: (handle: object) => this.attempt(() => {
        if (this.phase !== 'popping' || handle !== this.handle) return false;
        // Capture the actual native pop result before any reentrant parent preparation.
        const first = this.observe(), before = this.base(first), target = before.nextScene;
        if (first.scene !== this.inventory || !target || before.nextPrototype !== this.transition.prototype) throw Error('owned-repel-pop-mismatch');
        this.target = target; this.phase = 'returning';
        this.current(); const actual = this.observe(), t = this.base(actual);
        if (actual.scene !== this.inventory || t.nextScene !== target || t.nextPrototype !== this.transition.prototype) throw Error('owned-repel-pop-changed');
        return true;
      }),
      returned: (handle: object) => this.attempt(() => {
        if (this.phase !== 'returning' || handle !== this.handle) return false;
        this.current(); const actual = this.observe(), t = this.base(actual);
        if (actual.scene !== this.target || t.nextScene !== null || !t.started || t.prototype !== this.transition.prototype) throw Error('owned-repel-return-not-ready');
        this.phase = 'returned'; return true;
      }),
    });
  }
  private retire(handle: object, scene: object): boolean {
    if (handle !== this.handle || scene !== this.inventory || !this.canRetire()) return false;
    try { const actual = this.observe(), t = this.base(actual); return actual.scene === scene && t.nextScene === null; } catch { return false; }
  }
  private attempt(action: () => boolean): boolean {
    if (this.closed) return false;
    try { return action(); } catch { this.failed = true; return false; }
  }
  private base(actual: WorldHostLifecycle): WorldSceneTransition {
    const source = this.source, t = actual.sceneTransition, point = actual.playerPosition;
    if (!t || t.manager !== this.transition.manager || actual.map !== source.map || actual.player !== source.player || actual.mapId !== source.mapId ||
      actual.map !== this.step.map || actual.player !== this.step.player || actual.mapId !== this.step.mapId || !point || point.x !== this.step.x || point.y !== this.step.y) throw Error('owned-repel-native-source-changed');
    return t;
  }
  /** Pure check, called only after every reentrant parent provider has completed. */
  accepts(actual: WorldHostLifecycle): boolean {
    if (this.failed) return false;
    let t: WorldSceneTransition; try { t = this.base(actual); } catch { return false; }
    if (this.phase === 'opening') return actual.scene === this.source.scene && t.nextScene === null;
    if (this.phase === 'inventory') return actual.scene === this.source.scene && t.nextScene === this.inventory || actual.scene === this.inventory && t.nextScene === null;
    if (this.phase === 'popping') return actual.scene === this.inventory && t.nextScene === null;
    if (this.phase === 'returning') return actual.scene === this.inventory && t.nextScene === this.target && t.nextPrototype === this.transition.prototype ||
      actual.scene === this.target && t.nextScene === null && t.prototype === this.transition.prototype;
    return actual.scene === this.target && t.nextScene === null && t.prototype === this.transition.prototype;
  }
  assert(actual: WorldHostLifecycle): void { if (!this.accepts(actual)) throw Error('owned-repel-scene-changed'); }
  close(): void { this.closed = true; }
}
