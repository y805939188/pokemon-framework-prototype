import { selectBattlebackResources } from './battleback-resources';
import type { BattlebackContext, BattlebackResourcePlan } from './battleback-resources';

export type BattlebackRole = 'background' | 'foeBase' | 'playerBase' | 'message';
export interface BattlebackAsset<T> { value: T; release(): void; }
export interface BattlebackPorts<T> {
  current(): boolean;
  now(): number;
  resolve(logicalPath: string): string | null;
  /** Cancel stops pending work; a delivered asset remains owned by this view until release. */
  load(path: string, loaded: (asset: BattlebackAsset<T>) => void, failed: (error: unknown) => void): () => void;
  draw(images: Readonly<Partial<Record<BattlebackRole, T>>>): void;
  dispose(): void;
  failed(error: unknown): void;
}
interface Entry<T> {
  role: BattlebackRole; logicalPath: string; path: string | null;
  status: 'loading' | 'ready' | 'fallback'; reason?: string; error?: string;
  asset?: BattlebackAsset<T>; cancel?: () => void;
}
const roles: readonly BattlebackRole[] = ['background', 'foeBase', 'playerBase', 'message'];

/** Four private static resources, sequenced by the existing Scene owner. No battle or shared-cache authority. */
export class BattlebackView<T> {
  private retired = false;
  private entries: Entry<T>[] = [];
  private plan: BattlebackResourcePlan | null = null;
  private context: BattlebackContext;
  private lastTime = 0;
  private deadline = 0;
  private released = new Set<BattlebackAsset<T>>();
  readonly cleanupErrors: string[] = [];
  constructor(context: BattlebackContext, private readonly ports: BattlebackPorts<T>) {
    this.context = { ...context };
    if (!this.current()) { this.dispose(); return; }
    const cache = new Map<string, string | null>();
    const resolve = (logical: string): string | null => {
      if (!this.current()) return null;
      if (!cache.has(logical)) {
        const path = ports.resolve(logical);
        if (!this.current()) return null;
        if (path !== null && (typeof path !== 'string' || !path)) throw new Error('invalid battleback resolved path');
        cache.set(logical, path);
      }
      return cache.get(logical)!;
    };
    this.plan = selectBattlebackResources(this.context, logical => resolve(logical) !== null);
    if (!this.current()) { this.dispose(); return; }
    this.lastTime = ports.now();
    if (!Number.isFinite(this.lastTime) || this.lastTime < 0) throw new Error('invalid battleback clock');
    this.deadline = this.lastTime + 5000;
    if (!Number.isFinite(this.deadline) || this.deadline <= this.lastTime) throw new Error('invalid battleback deadline');
    this.entries = roles.map(role => ({ role, logicalPath: this.plan![role], path: resolve(this.plan![role]), status: 'loading' }));
    if (!this.current()) { this.dispose(); return; }
    this.redraw();
    for (const entry of this.entries) {
      if (!this.current()) { this.dispose(); break; }
      if (entry.path === null) { this.complete(entry, undefined, 'missing'); continue; }
      try {
        const stop = ports.load(entry.path, asset => this.complete(entry, asset), error => this.complete(entry, undefined, 'load-error', error));
        if (typeof stop !== 'function') throw new Error('invalid battleback cancellation handle');
        let stopped = false;
        entry.cancel = () => { if (!stopped) { stopped = true; stop(); } };
        if (entry.status !== 'loading' || !this.current()) this.cancel(entry);
      } catch (error) {
        this.release(entry.asset); entry.asset = undefined;
        if (this.current()) { entry.status = 'fallback'; entry.reason = 'load-error'; entry.error = String(error); this.redraw(); }
      }
    }
  }
  current(): boolean { return !this.retired && this.ports.current(); }
  get ready(): boolean { return !this.retired && this.entries.length === 4 && this.entries.every(entry => entry.status !== 'loading'); }
  poll(): void {
    if (!this.current()) { this.dispose(); return; }
    if (this.ready) return;
    const now = this.ports.now();
    if (!this.current()) { this.dispose(); return; }
    if (!Number.isFinite(now) || now < this.lastTime) throw new Error('invalid battleback clock');
    this.lastTime = now;
    if (now >= this.deadline) for (const entry of this.entries) if (entry.status === 'loading') this.complete(entry, undefined, 'timeout');
  }
  private release(asset?: BattlebackAsset<T>): void {
    if (!asset || this.released.has(asset)) return;
    this.released.add(asset);
    try { asset.release(); } catch (error) { this.cleanupErrors.push(String(error)); }
  }
  private cancel(entry: Entry<T>): void {
    const cancel = entry.cancel; entry.cancel = undefined;
    try { cancel?.(); } catch (error) { this.cleanupErrors.push(String(error)); }
  }
  private complete(entry: Entry<T>, asset?: BattlebackAsset<T>, reason?: string, error?: unknown): void {
    if (!this.current()) { this.release(asset); this.dispose(); return; }
    if (entry.status !== 'loading') {
      if (entry.asset !== asset || this.retired) this.release(asset);
      return;
    }
    if (asset && (typeof asset !== 'object' || typeof asset.release !== 'function')) throw new Error('invalid battleback loaded asset');
    entry.asset = asset; entry.status = asset ? 'ready' : 'fallback';
    entry.reason = reason; if (error !== undefined) entry.error = String(error);
    this.cancel(entry); this.redraw();
  }
  private redraw(): void {
    if (!this.current()) return;
    const images: Partial<Record<BattlebackRole, T>> = {};
    for (const entry of this.entries) if (entry.asset) images[entry.role] = entry.asset.value;
    try { this.ports.draw(images); }
    catch (error) {
      const current = this.current(); this.dispose();
      if (current && this.ports.current()) this.ports.failed(error);
    }
    if (!this.current()) this.dispose();
  }
  snapshot(): object {
    return { version: 'd2-battleback-view-v1', context: { ...this.context }, ready: this.ready, retired: this.retired,
      ownedAssets: this.entries.filter(entry => !!entry.asset).length,
      rows: this.entries.map(({ role, logicalPath, path, status, reason, error }) => ({ role, logicalPath, path, status, reason, error })),
      probes: this.plan?.probes.map(probe => ({ ...probe })) ?? [], cleanupErrors: [...this.cleanupErrors] };
  }
  dispose(): void {
    if (this.retired) return;
    this.retired = true;
    for (const entry of this.entries) { this.cancel(entry); this.release(entry.asset); entry.asset = undefined; }
    try { this.ports.dispose(); } catch (error) { this.cleanupErrors.push(String(error)); }
  }
}
