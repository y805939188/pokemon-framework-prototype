/** F-owned projection-only child. Persistent companions belong exclusively to the F atomic writer. */
export interface CompanionResetApplication {
  isBlackoutPreparing(owner: object): boolean;
  /** Actual F private post-install acknowledgement. Missing support cannot open automatic cleanup. */
  isBlackoutCompanionClearCommitted?(owner: object, receipt: object, revision: number): boolean;
  /** Distinct private post-abort recovery attempt; never asserts business companions were cleared. */
  isBlackoutCompanionClearAborted?(owner: object, receipt: object, recovery: object): boolean;
}
export interface CompanionResetSource {
  readonly application: object; readonly generation: number;
  readonly map: object; readonly mapId: number; readonly data: object;
  readonly player: object; readonly scene: object;
  readonly x: number; readonly y: number; readonly direction: 2 | 4 | 6 | 8;
  readonly transferring: boolean; readonly nextScene: object | null;
}
export interface CompanionResetResources {
  /** null means unobserved after a thrown/invalid adapter result, never a successful zero. */
  readonly hadSurface: boolean | null; readonly spritesRemaining: number | null; readonly charactersRemaining: number | null;
  readonly motionsRemaining: number | null; readonly maskDetached: boolean | null;
}
export interface CompanionResetNativeResult {
  readonly status: 'cleared' | 'fallback' | 'rejected'; readonly resources: CompanionResetResources;
  readonly diagnostics: readonly string[]; readonly reason?: string;
}
/** Fields are informational; only the controller's private exact-object registry issues a binding. */
export interface CompanionResetBinding extends CompanionResetSource { readonly owner: object }
declare const resetReceiptBrand: unique symbol;
export interface CompanionResetReceipt { readonly [resetReceiptBrand]: true }
export interface CompanionResetOutcome {
  readonly status: 'cleared' | 'fallback' | 'rejected' | 'cancelled'; readonly receipt: CompanionResetReceipt;
  readonly resources: CompanionResetResources; readonly diagnostics: readonly string[]; readonly reason?: string;
}
export interface CompanionResetTerminal {
  readonly owner: object; readonly generation: number; readonly outcome: CompanionResetOutcome;
  /** Known-pure closure: private membership only, no App/source/provider/host calls. */
  accept(owner: object, generation: number): boolean;
}
export interface CompanionResetOptions {
  readonly application: CompanionResetApplication;
  generation(): number;
  /** Actual native own-data source. Unknown providers run outside every atomic final interval. */
  source(): CompanionResetSource | null;
  clear(binding: CompanionResetBinding): CompanionResetNativeResult | Promise<CompanionResetNativeResult>;
  retry(binding: CompanionResetBinding): CompanionResetNativeResult;
}
interface Entry {
  readonly owner: object; readonly generation: number; readonly epoch: number; readonly binding: CompanionResetBinding;
  readonly receipt: CompanionResetReceipt; readonly promise: Promise<CompanionResetOutcome>;
  readonly resolve: (outcome: CompanionResetOutcome) => void;
  phase: 'running' | 'retiring' | 'terminal'; cancelled: boolean; retryAttempted: boolean;
  cleanupAttempt: object | null; cleanupParent: object | null;
  committedRevision: number | null;
  abortRecovery: object | null;
  outcome: CompanionResetOutcome | null;
}
const unknownResources: CompanionResetResources = Object.freeze({ hadSurface: null, spritesRemaining: null, charactersRemaining: null, motionsRemaining: null, maskDetached: null });
const why = (error: unknown): string => error instanceof Error ? error.message : String(error);
function same(a: CompanionResetSource, b: CompanionResetSource): boolean {
  return a.application === b.application && a.generation === b.generation && a.map === b.map && a.mapId === b.mapId
    && a.data === b.data && a.player === b.player && a.scene === b.scene && a.x === b.x && a.y === b.y
    && a.direction === b.direction && a.transferring === b.transferring && a.nextScene === b.nextScene;
}
function checked(result: CompanionResetNativeResult): CompanionResetNativeResult {
  if (!result || !['cleared', 'fallback', 'rejected'].includes(result.status) || !Array.isArray(result.diagnostics)
    || !result.diagnostics.every(message => typeof message === 'string')) throw Error('companion-reset-result-invalid');
  const r = result.resources;
  if (!r || r.hadSurface !== null && typeof r.hadSurface !== 'boolean' || r.maskDetached !== null && typeof r.maskDetached !== 'boolean'
    || ![r.spritesRemaining, r.charactersRemaining, r.motionsRemaining].every(n => n === null || typeof n === 'number' && Number.isSafeInteger(n) && n >= 0)) throw Error('companion-reset-resources-invalid');
  if (result.status === 'cleared' && (r.hadSurface === null || r.spritesRemaining !== 0 || r.charactersRemaining !== 0 || r.motionsRemaining !== 0 || r.maskDetached !== true)) throw Error('companion-reset-false-cleared');
  return Object.freeze({ ...result, resources: Object.freeze({ ...r }), diagnostics: Object.freeze([...result.diagnostics]) });
}
export class CompanionProjectionReset {
  #application: CompanionResetApplication;
  #phaseReader: CompanionResetApplication['isBlackoutPreparing'];
  #options: CompanionResetOptions;
  #bindings = new WeakMap<object, Entry>();
  #owners = new WeakMap<object, Entry>();
  #receipts = new WeakMap<object, Entry>();
  #pending = new Set<Entry>();
  #epoch = 0;
  #active: Entry | null = null;
  #commitCandidate: Entry | null = null;
  #commitReader: CompanionResetApplication['isBlackoutCompanionClearCommitted'];
  #abortReader: CompanionResetApplication['isBlackoutCompanionClearAborted'];
  constructor(options: CompanionResetOptions) {
    this.#application = options.application; this.#phaseReader = options.application.isBlackoutPreparing;
    this.#commitReader = options.application.isBlackoutCompanionClearCommitted;
    this.#abortReader = options.application.isBlackoutCompanionClearAborted;
    if (typeof this.#phaseReader !== 'function' || typeof options.clear !== 'function' || typeof options.retry !== 'function') throw Error('companion-reset-capability-unavailable');
    this.#options = Object.freeze({ ...options });
  }
  private source(): CompanionResetSource {
    const value = this.#options.source(), generation = this.#options.generation();
    if (!value || value.application !== this.#application || value.generation !== generation || !Number.isSafeInteger(generation) || generation < 0
      || !Number.isSafeInteger(value.mapId) || value.mapId < 1
      || !Number.isSafeInteger(value.x) || !Number.isSafeInteger(value.y) || ![2, 4, 6, 8].includes(value.direction)
      || value.transferring !== false || value.nextScene !== null
      || ![value.map, value.data, value.player, value.scene].every(o => o !== null && typeof o === 'object')) throw Error('companion-reset-source-unavailable');
    return Object.freeze({ ...value });
  }
  private current(entry: Entry, preparing: boolean): boolean {
    try {
      if (entry.epoch !== this.#epoch || this.#bindings.get(entry.binding) !== entry || entry.phase === 'terminal') return false;
      if (preparing && (entry.cancelled || Reflect.apply(this.#phaseReader, this.#application, [entry.owner]) !== true)) return false;
      const actual = this.source();
      if ((preparing ? !same(entry.binding, actual) : entry.binding.application !== actual.application || entry.generation !== actual.generation)
        || entry.epoch !== this.#epoch || this.#bindings.get(entry.binding) !== entry) return false;
      return !preparing || !entry.cancelled && Reflect.apply(this.#phaseReader, this.#application, [entry.owner]) === true;
    } catch { return false; }
  }
  /** Captured once by the actual native factory. Retiring grants only exact old-resource cleanup. */
  isBindingIssued(candidate: unknown): boolean {
    if (!candidate || typeof candidate !== 'object') return false;
    const entry = this.#bindings.get(candidate);
    return !!entry && entry.phase === 'running' && candidate === entry.binding && this.current(entry, true);
  }
  isRetirementIssued(candidate: unknown): boolean {
    if (!candidate || typeof candidate !== 'object') return false;
    const entry = this.#bindings.get(candidate);
    if (!entry || entry.phase !== 'retiring' || candidate !== entry.binding || !entry.cleanupAttempt || !this.current(entry, false)) return false;
    try { return entry.cleanupParent === null || Reflect.apply(this.#phaseReader, this.#application, [entry.cleanupParent]) === true; }
    catch { return false; }
  }
  retirementAttempt(candidate: unknown): object | null {
    return this.isRetirementIssued(candidate) && candidate && typeof candidate === 'object' ? this.#bindings.get(candidate)!.cleanupAttempt : null;
  }
  /** Informational private receipt membership for outside-final consumers; not a state writer. */
  readReceipt(receipt: unknown): Readonly<{ owner: object; generation: number; outcome: CompanionResetOutcome }> | null {
    if (!receipt || typeof receipt !== 'object') return null;
    const entry = this.#receipts.get(receipt);
    return entry?.outcome ? Object.freeze({ owner: entry.owner, generation: entry.generation, outcome: entry.outcome }) : null;
  }
  prepareTerminal(receipt: unknown): CompanionResetTerminal | null {
    if (!receipt || typeof receipt !== 'object') return null;
    const entry = this.#receipts.get(receipt), outcome = entry?.outcome;
    if (!entry || !outcome || outcome.status !== 'cleared' && outcome.status !== 'fallback' || entry.cancelled
      || entry.committedRevision !== null || this.#commitCandidate !== entry || entry.epoch !== this.#epoch) return null;
    // Runtime # slots and unexposed entry records cannot turn into getter/provider calls.
    return Object.freeze({ owner: entry.owner, generation: entry.generation, outcome,
      accept: (owner: object, generation: number): boolean => this.#commitCandidate === entry && this.#epoch === entry.epoch
        && this.#receipts.get(receipt) === entry && this.#owners.get(entry.owner) === entry && entry.receipt === receipt
        && entry.outcome === outcome && !entry.cancelled && entry.committedRevision === null
        && owner === entry.owner && generation === entry.generation });
  }
  /** Only after the actual F atomic installation. This never installs or inspects business data. */
  committed(receipt: unknown, revision: number): boolean {
    if (!receipt || typeof receipt !== 'object' || !Number.isSafeInteger(revision) || revision < 0 || typeof this.#commitReader !== 'function') return false;
    const entry = this.#receipts.get(receipt);
    if (!entry || entry.epoch !== this.#epoch || entry.cancelled || !entry.outcome
      || entry.outcome.status !== 'cleared' && entry.outcome.status !== 'fallback'
      || entry.committedRevision !== null && entry.committedRevision !== revision) return false;
    try {
      const actual = this.source();
      if (actual.application !== entry.binding.application || actual.generation !== entry.generation
        || Reflect.apply(this.#commitReader, this.#application, [entry.owner, receipt, revision]) !== true) return false;
      if (entry.epoch !== this.#epoch || entry.cancelled || this.#receipts.get(receipt) !== entry
        || this.#options.generation() !== entry.generation || !same(actual, this.source())) return false;
      entry.committedRevision = revision;
      if (this.#commitCandidate === entry) this.#commitCandidate = null;
      return true;
    } catch { return false; }
  }
  /** A failed/cancelled F install may retire its native prefix without pretending [] committed. */
  abort(receipt: unknown, recovery: object): boolean {
    if (!receipt || typeof receipt !== 'object' || !recovery || typeof recovery !== 'object' || typeof this.#abortReader !== 'function') return false;
    const entry = this.#receipts.get(receipt);
    if (!entry || !entry.outcome || entry.epoch !== this.#epoch || entry.committedRevision !== null) return false;
    try {
      const actual = this.source();
      if (actual.application !== entry.binding.application || actual.generation !== entry.generation
        || Reflect.apply(this.#abortReader, this.#application, [entry.owner, receipt, recovery]) !== true) return false;
      if (entry.epoch !== this.#epoch || this.#receipts.get(receipt) !== entry || this.#options.generation() !== entry.generation || !same(actual, this.source())) return false;
      if (entry.abortRecovery !== recovery) entry.retryAttempted = false;
      entry.abortRecovery = recovery; entry.cancelled = true;
      if (this.#commitCandidate === entry) this.#commitCandidate = null;
      return true;
    } catch { return false; }
  }
  run(owner: object): Promise<CompanionResetOutcome> {
    const old = this.#owners.get(owner); if (old) return old.promise;
    const receipt = Object.freeze({}) as CompanionResetReceipt;
    const rejected = (reason: string): Promise<CompanionResetOutcome> => Promise.resolve({ status: 'rejected', receipt, resources: unknownResources, diagnostics: [], reason });
    if (!owner || typeof owner !== 'object' || this.#active) return rejected('companion-reset-active');
    let source: CompanionResetSource;
    try {
      if (Reflect.apply(this.#phaseReader, this.#application, [owner]) !== true) return rejected('companion-reset-parent-unissued');
      source = this.source();
      if (Reflect.apply(this.#phaseReader, this.#application, [owner]) !== true) return rejected('companion-reset-parent-stale');
    } catch (error) { return rejected(why(error)); }
    let resolve!: (outcome: CompanionResetOutcome) => void;
    const promise = new Promise<CompanionResetOutcome>(complete => { resolve = complete; });
    const binding = Object.freeze({ ...source, owner });
    const entry: Entry = { owner, generation: source.generation, epoch: this.#epoch, binding, receipt, promise, resolve,
      phase: 'running', cancelled: false, retryAttempted: false, cleanupAttempt: null, cleanupParent: null, committedRevision: null, abortRecovery: null, outcome: null };
    this.#owners.set(owner, entry); this.#bindings.set(binding, entry); this.#receipts.set(receipt, entry); this.#active = entry;
    this.#commitCandidate = entry;
    const finish = (raw: CompanionResetNativeResult): void => {
      let result: CompanionResetNativeResult;
      try { result = checked(raw); }
      catch (error) { result = { status: 'fallback', resources: unknownResources, diagnostics: [why(error)], reason: why(error) }; }
      const status = entry.cancelled ? 'cancelled' : !this.current(entry, true) ? 'rejected' : result.status;
      const outcome: CompanionResetOutcome = Object.freeze({ ...result, status, receipt,
        ...(status === 'rejected' && result.status !== 'rejected' ? { reason: 'companion-reset-parent-source-stale' } : {}) });
      entry.outcome = outcome; entry.phase = 'retiring';
      if (status !== 'cleared' && status !== 'fallback' && this.#commitCandidate === entry) this.#commitCandidate = null;
      if ((result.status === 'fallback' || result.resources.hadSurface === true)
        && (result.resources.spritesRemaining !== 0 || result.resources.charactersRemaining !== 0 || result.resources.motionsRemaining !== 0 || result.resources.maskDetached !== true)) this.#pending.add(entry);
      else entry.phase = 'terminal';
      if (this.#active === entry) this.#active = null;
      entry.resolve(outcome);
    };
    try {
      if (!this.current(entry, true)) throw Error('companion-reset-parent-source-stale');
      Promise.resolve(this.#options.clear(binding)).then(finish, error => finish({ status: 'fallback', resources: unknownResources, diagnostics: [why(error)], reason: why(error) }));
    } catch (error) { finish({ status: 'fallback', resources: unknownResources, diagnostics: [why(error)], reason: why(error) }); }
    return promise;
  }
  cancel(owner: object): void {
    const entry = this.#owners.get(owner);
    if (entry && entry.committedRevision === null) { entry.cancelled = true; if (this.#commitCandidate === entry) this.#commitCandidate = null; }
  }
  /** At most one automatic cleanup opportunity per exact retired child; never issues a business action. */
  recoverPending(parentOwner?: object): readonly CompanionResetNativeResult[] {
    const results: CompanionResetNativeResult[] = [];
    if (parentOwner !== undefined) {
      try { if (Reflect.apply(this.#phaseReader, this.#application, [parentOwner]) !== true) return [{ status: 'rejected', resources: unknownResources, diagnostics: [], reason: 'companion-reset-retry-parent-unissued' }]; }
      catch { return [{ status: 'rejected', resources: unknownResources, diagnostics: [], reason: 'companion-reset-retry-parent-unissued' }]; }
    }
    for (const entry of this.#pending) {
      if (entry.committedRevision === null && entry.abortRecovery === null || entry.cleanupAttempt || entry.retryAttempted && parentOwner === undefined) continue;
      entry.retryAttempted = true;
      if (!this.current(entry, false)) { results.push({ status: 'rejected', resources: entry.outcome!.resources, diagnostics: [], reason: 'companion-reset-retirement-stale' }); continue; }
      const attempt = Object.freeze({}); entry.cleanupAttempt = attempt; entry.cleanupParent = parentOwner ?? null;
      let result: CompanionResetNativeResult | null = null;
      try {
        const fresh = this.source();
        try { result = checked(this.#options.retry(entry.binding)); }
        catch (error) { result = { status: 'fallback', resources: unknownResources, diagnostics: [why(error)], reason: why(error) }; }
        if (!this.isRetirementIssued(entry.binding) || !same(fresh, this.source())) result = { ...result, status: 'rejected', reason: 'companion-reset-retirement-stale' };
      } catch (error) {
        result = { status: 'rejected', resources: result?.resources ?? unknownResources, diagnostics: [...(result?.diagnostics ?? []), why(error)], reason: 'companion-reset-retirement-source-unavailable' };
      } finally { if (entry.cleanupAttempt === attempt) { entry.cleanupAttempt = null; entry.cleanupParent = null; } }
      results.push(result);
      if (result.status === 'cleared') { this.#pending.delete(entry); entry.phase = 'terminal'; }
    }
    return results;
  }
  invalidate(): void { this.#epoch++; if (this.#active) this.#active.cancelled = true; this.#active = null; this.#commitCandidate = null; this.#pending.clear(); }
}
