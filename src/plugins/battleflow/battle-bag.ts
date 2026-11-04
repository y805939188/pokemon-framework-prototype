/** WP67-A §5.1–5.3: scene-local selection only; the caller owns eligibility and registration. */
import { nextPocket } from '../inventory/model';
import type { ItemDefinition } from '../../framework/rules/item-catalog';

/** Join public Session quantities to catalog metadata before opening; quantities are already aggregated. */
export interface BattleBagItem {
  itemId: string;
  battleId: string;
  pocket: number;
  quantity: number;
  battleUse: ItemDefinition['battleUse'];
}
export interface BattleBagMove { slot: number; moveId: string }
export interface BattleBagMember { memberId: string; egg: boolean; moves: readonly BattleBagMove[] }
export interface BattleBagInput {
  internalBattle: boolean;
  actorId: string;
  items: readonly BattleBagItem[];
  members: readonly BattleBagMember[];
  /** Publicly shown player positions and non-fainted opposing positions, expressed as stable identities. */
  activeIds: readonly string[];
  foeIds: readonly string[];
}
export type BattleBagTarget =
  | { kind: 'member' | 'active'; memberId: string }
  | { kind: 'move'; memberId: string; slot: number; moveId: string }
  | { kind: 'foe'; memberId: string }
  | { kind: 'direct'; memberId: string };
/** An immutable candidate. Resolve a failed canUse or completed registration; positive canUse alone is not acceptance. */
export interface BattleBagRequest {
  readonly itemId: string;
  readonly battleId: string;
  readonly target: Readonly<BattleBagTarget>;
}
export type BattleBagView =
  | { kind: 'closed'; reason: 'idle' | 'cancelled' | 'accepted' | 'unavailable' }
  | { kind: 'items'; pocket: number; cursor: number; rows: BattleBagItem[] }
  | { kind: 'commands'; item: BattleBagItem; cursor: number; commands: readonly ['use', 'cancel'] }
  | { kind: 'members'; item: BattleBagItem; cursor: number; rows: BattleBagMember[] }
  | { kind: 'moves'; item: BattleBagItem; memberId: string; cursor: number; rows: BattleBagMove[] }
  | { kind: 'foes'; item: BattleBagItem; cursor: number; rows: string[] }
  | { kind: 'submitting'; request: BattleBagRequest };
type Layer = BattleBagView['kind'];
type RefusalReturn = 'members' | 'items';

function identity(id: string): void {
  if (typeof id !== 'string' || !id) throw new Error('invalid battle bag identity');
}
function unique(ids: readonly string[]): void {
  ids.forEach(identity);
  if (new Set(ids).size !== ids.length) throw new Error('duplicate battle bag identity');
}
function copyMember(member: BattleBagMember): BattleBagMember {
  return { memberId: member.memberId, egg: member.egg, moves: member.moves.map(move => ({ ...move })) };
}

/**
 * One instance per battle. Field inventory/cursors are never accepted or written.
 * open() supplies a fresh public snapshot while preserving only battle pocket/row memory.
 * Each list has an explicit Cancel row at rows.length; a commands Cancel returns to items.
 * The host handles fade/input ownership, localized text, canUse, reservations and execution.
 */
export class BattleBagSelection {
  private layer: Layer = 'closed';
  private reason: Extract<BattleBagView, { kind: 'closed' }>['reason'] = 'idle';
  private pocket = 1;
  private indices: number[] = Array(8).fill(0) as number[];
  private pockets: BattleBagItem[][] = Array.from({ length: 8 }, () => []);
  private input: BattleBagInput | null = null;
  private item: BattleBagItem | null = null;
  private cursor = 0;
  private memberCursor = 0;
  private member: BattleBagMember | null = null;
  private pending: { request: BattleBagRequest; refused: RefusalReturn } | null = null;

  open(input: BattleBagInput): void {
    if (this.layer !== 'closed') throw new Error('battle bag already open');
    // Validate a complete snapshot before replacing any local state.
    identity(input.actorId);
    unique(input.members.map(member => member.memberId));
    unique(input.activeIds); unique(input.foeIds);
    if (!input.members.some(member => member.memberId === input.actorId)
      || input.activeIds.some(id => !input.members.some(member => member.memberId === id))) {
      throw new Error('unknown battle bag player identity');
    }
    for (const member of input.members) {
      if (typeof member.egg !== 'boolean') throw new Error('invalid battle bag member');
      unique(member.moves.map(move => String(move.slot)));
      for (const move of member.moves) {
        identity(move.moveId);
        if (!Number.isSafeInteger(move.slot) || move.slot < 0 || move.slot > 3) throw new Error('invalid battle bag move slot');
      }
    }
    unique(input.items.map(item => item.itemId)); unique(input.items.map(item => item.battleId));
    const pockets: BattleBagItem[][] = Array.from({ length: 8 }, () => []);
    for (const item of input.items) {
      if (!Number.isSafeInteger(item.pocket) || item.pocket < 1 || item.pocket > 8
        || !Number.isSafeInteger(item.quantity) || item.quantity < 0
        || !['none', 'member', 'move', 'active', 'foe', 'direct', 'ball'].includes(item.battleUse)) {
        throw new Error('invalid published battle bag item');
      }
      if (item.battleUse !== 'none' && item.quantity > 0) pockets[item.pocket - 1]!.push({ ...item });
    }
    this.input = { ...input, items: input.items.map(item => ({ ...item })),
      members: input.members.map(copyMember), activeIds: [...input.activeIds], foeIds: [...input.foeIds] };
    this.pockets = pockets;
    this.item = null; this.member = null; this.pending = null;
    if (!input.internalBattle) { this.close('unavailable'); return; }
    this.showItems();
  }

  view(): BattleBagView {
    switch (this.layer) {
      case 'closed': return { kind: 'closed', reason: this.reason };
      case 'items': return { kind: 'items', pocket: this.pocket, cursor: this.cursor, rows: this.rows().map(item => ({ ...item })) };
      case 'commands': return { kind: 'commands', item: { ...this.item! }, cursor: this.cursor, commands: ['use', 'cancel'] };
      case 'members': return { kind: 'members', item: { ...this.item! }, cursor: this.cursor, rows: this.input!.members.map(copyMember) };
      case 'moves': return { kind: 'moves', item: { ...this.item! }, memberId: this.member!.memberId,
        cursor: this.cursor, rows: this.member!.moves.map(move => ({ ...move })) };
      case 'foes': return { kind: 'foes', item: { ...this.item! }, cursor: this.cursor, rows: [...this.input!.foeIds] };
      case 'submitting': return { kind: 'submitting', request: this.pending!.request };
    }
  }

  /** Touch/mouse selection changes focus only; confirm is always a separate operation. */
  select(index: number): void {
    if (this.layer === 'closed' || this.layer === 'submitting') return;
    if (!Number.isSafeInteger(index) || index < 0 || index >= this.rowCount()) throw new Error('invalid battle bag cursor');
    this.cursor = index;
    if (this.layer === 'items') this.indices[this.pocket - 1] = index;
  }

  move(direction: 'up' | 'down' | 'left' | 'right'): void {
    if (this.layer === 'closed' || this.layer === 'submitting') return;
    if (direction === 'left' || direction === 'right') {
      if (this.layer !== 'items') return;
      this.pocket = nextPocket(this.pocket, direction === 'left' ? -1 : 1, this.pockets.map(rows => rows.length), true);
      this.showItems();
    } else {
      const count = this.rowCount();
      this.select((this.cursor + (direction === 'up' ? -1 : 1) + count) % count);
    }
  }

  confirm(): BattleBagRequest | null {
    switch (this.layer) {
      case 'items': {
        const item = this.rows()[this.cursor];
        if (!item) { this.close('cancelled'); return null; }
        this.item = item; this.layer = 'commands'; this.cursor = 0; return null;
      }
      case 'commands':
        if (this.cursor === 1) { this.showItems(); return null; }
        return this.use();
      case 'members': {
        const member = this.input!.members[this.cursor];
        if (!member) { this.showItems(); return null; }
        if (member.egg) return null;
        this.member = member; this.memberCursor = this.cursor;
        if (this.item!.battleUse === 'move') { this.layer = 'moves'; this.cursor = 0; return null; }
        return this.request({ kind: this.item!.battleUse === 'active' ? 'active' : 'member', memberId: member.memberId }, 'members');
      }
      case 'moves': {
        const move = this.member!.moves[this.cursor];
        if (!move) { this.showMembers(this.memberCursor); return null; }
        return this.request({ kind: 'move', memberId: this.member!.memberId, ...move }, 'members');
      }
      case 'foes': {
        const memberId = this.input!.foeIds[this.cursor];
        if (!memberId) { this.showItems(); return null; }
        return this.request({ kind: 'foe', memberId }, 'items');
      }
      default: return null;
    }
  }

  cancel(): void {
    switch (this.layer) {
      case 'items': this.close('cancelled'); break;
      case 'commands': case 'members': case 'foes': this.showItems(); break;
      case 'moves': this.showMembers(this.memberCursor); break;
      // A submitted candidate is owned by the caller until resolve or retire; BACK cannot race registration.
    }
  }

  /** Returns false for late/repeated/other-instance replies; they cannot close a newer menu. */
  resolve(request: BattleBagRequest, result: { ok: boolean }): boolean {
    if (!this.pending || this.pending.request !== request) return false;
    const refused = this.pending.refused;
    this.pending = null;
    if (result.ok) this.close('accepted');
    else if (refused === 'members') this.showMembers(this.memberCursor);
    else this.showItems();
    return true;
  }

  /** Call when the battle/scene retires or the game is replaced; no resource or field-cursor rollback occurs here. */
  retire(): void {
    this.close('idle'); this.input = null; this.item = null; this.member = null;
    this.pockets = Array.from({ length: 8 }, () => []);
    this.pocket = 1; this.indices = Array(8).fill(0) as number[];
  }

  private rows(): BattleBagItem[] { return this.pockets[this.pocket - 1]!; }
  private showItems(): void {
    if (!this.rows().length) this.pocket = nextPocket(this.pocket, 1, this.pockets.map(rows => rows.length), true);
    this.layer = 'items'; this.cursor = Math.min(this.indices[this.pocket - 1]!, this.rows().length);
    this.indices[this.pocket - 1] = this.cursor;
    this.item = null; this.member = null;
  }
  private showMembers(cursor = 0): void {
    this.layer = 'members'; this.cursor = Math.min(cursor, this.input!.members.length); this.memberCursor = this.cursor;
  }
  private rowCount(): number {
    switch (this.layer) {
      case 'items': return this.rows().length + 1;
      case 'commands': return 2;
      case 'members': return this.input!.members.length + 1;
      case 'moves': return this.member!.moves.length + 1;
      case 'foes': return this.input!.foeIds.length + 1;
      default: return 0;
    }
  }
  private use(): BattleBagRequest | null {
    const input = this.input!, use = this.item!.battleUse;
    if (use === 'member' && input.members.length === 1 && !input.members[0]!.egg) {
      this.memberCursor = 0;
      return this.request({ kind: 'member', memberId: input.members[0]!.memberId }, 'members');
    }
    if (use === 'active' && input.activeIds.length === 1) {
      this.memberCursor = input.members.findIndex(member => member.memberId === input.activeIds[0]);
      return this.request({ kind: 'active', memberId: input.activeIds[0]! }, 'members');
    }
    if (use === 'member' || use === 'move' || use === 'active') { this.showMembers(); return null; }
    if (use === 'foe' || use === 'ball') {
      if (input.foeIds.length === 1) return this.request({ kind: 'foe', memberId: input.foeIds[0]! }, 'items');
      this.layer = 'foes'; this.cursor = 0; return null;
    }
    return this.request({ kind: 'direct', memberId: input.actorId }, 'items');
  }
  private request(target: BattleBagTarget, refused: RefusalReturn): BattleBagRequest {
    const request: BattleBagRequest = Object.freeze({ itemId: this.item!.itemId, battleId: this.item!.battleId,
      target: Object.freeze({ ...target }) });
    this.pending = { request, refused }; this.layer = 'submitting'; return request;
  }
  private close(reason: Extract<BattleBagView, { kind: 'closed' }>['reason']): void {
    this.layer = 'closed'; this.reason = reason; this.pending = null;
  }
}
