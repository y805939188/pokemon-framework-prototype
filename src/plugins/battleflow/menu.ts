/** Scene-local navigation only. No battle choices, persistent state, timers or host ownership. */
export type GridDirection = 'up' | 'down' | 'left' | 'right';
export type RememberedMenu = 'main' | 'moves';
function size(count: number): void {
  if (!Number.isSafeInteger(count) || count < 0 || count > 4) throw new Error('invalid battle grid size');
}
function slot(index: number, count: number): void {
  if (!Number.isSafeInteger(index) || index < 0 || index >= count) throw new Error('invalid battle grid slot');
}
/** Four row-major cells. Edges and absent trailing moves never wrap to another row. */
export function gridCursor(index: number, direction: GridDirection, count: number): number {
  size(count);
  if (!['up', 'down', 'left', 'right'].includes(direction)) throw new Error('invalid battle grid direction');
  if (!count) return -1;
  slot(index, count);
  const row = Math.floor(index / 2), column = index % 2;
  const next = direction === 'left' ? column ? index - 1 : index
    : direction === 'right' ? column ? index : index + 1
    : direction === 'up' ? row ? index - 2 : index
    : row ? index : index + 2;
  return next < count ? next : index;
}

/** Single-player position memory; a different publicly shown active member resets both menus. */
export class BattleMenuCursor {
  private activeMemberId: string | null = null;
  private indices = { main: 0, moves: 0 };
  bindActive(memberId: string | null): void {
    if (memberId !== null && (typeof memberId !== 'string' || !memberId)) throw new Error('invalid menu member identity');
    if (memberId !== this.activeMemberId) { this.activeMemberId = memberId; this.indices = { main: 0, moves: 0 }; }
  }
  index(menu: RememberedMenu, count: number): number {
    size(count);
    if (menu !== 'main' && menu !== 'moves') throw new Error('invalid remembered battle menu');
    return count ? this.indices[menu] < count ? this.indices[menu] : 0 : -1;
  }
  remember(menu: RememberedMenu, index: number, count: number): void {
    size(count);
    if (menu !== 'main' && menu !== 'moves') throw new Error('invalid remembered battle menu');
    if (!count) return;
    slot(index, count); this.indices[menu] = index;
  }
  clear(): void { this.activeMemberId = null; this.indices = { main: 0, moves: 0 }; }
}
