/** Read-only level-up numbers. Battle rules and input menus remain owned elsewhere. */
export const LEVEL_STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;
type StatKey = typeof LEVEL_STAT_KEYS[number];
export type LevelStats = Record<StatKey, number>;
export interface LevelStatsPage {
  level: number;
  phase: 'delta' | 'total';
  rows: { key: StatKey; value: number }[];
}
export interface LevelStatsPorts {
  current(): boolean;
  update(): number;
  use(): boolean;
  show(page: LevelStatsPage): void;
  confirmSound(): void;
  close(): void;
}

/** Two USE confirmations; BACK and fast mode never authorize this step. */
export class LevelStatsStep {
  readonly kind = 'visual' as const;
  private phase: 'delta' | 'total' | 'done' = 'delta';
  private shown = false;
  private shownUpdate = -1;
  private readonly before: LevelStats;
  private readonly after: LevelStats;
  constructor(private readonly level: number, stats: { before: LevelStats; after: LevelStats }, private readonly ports: LevelStatsPorts) {
    if (!Number.isSafeInteger(level) || level < 1) throw new Error('invalid level stats level');
    for (const side of [stats.before, stats.after]) for (const key of LEVEL_STAT_KEYS) {
      if (!Number.isSafeInteger(side[key]) || side[key] < 1) throw new Error('invalid level stat ' + key);
    }
    this.before = { ...stats.before }; this.after = { ...stats.after };
  }
  private paint(): void {
    if (this.phase === 'done') return;
    this.ports.show({ level: this.level, phase: this.phase,
      rows: LEVEL_STAT_KEYS.map(key => ({ key, value: this.phase === 'delta' ? this.after[key] - this.before[key] : this.after[key] })) });
    this.shown = true; this.shownUpdate = this.ports.update();
  }
  advance(_now: number): boolean {
    if (this.phase === 'done') return true;
    if (!this.ports.current()) { this.cancel(); return true; }
    if (!this.shown) { this.paint(); return false; }
    if (this.ports.update() <= this.shownUpdate || !this.ports.use()) return false;
    this.ports.confirmSound();
    if (!this.ports.current()) { this.cancel(); return true; }
    if (this.phase === 'delta') { this.phase = 'total'; this.paint(); return false; }
    this.cancel(); return true;
  }
  cancel(): void { if (this.phase === 'done') return; this.phase = 'done'; this.ports.close(); }
}
