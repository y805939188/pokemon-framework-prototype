/** Advisory shortcut projections. Actual execution belongs to the current parent operation. */
import { collectShortcutItems, collectShortcutMoves, isFieldShortcutMoveId, resolveShortcutMove } from '../rules/field-shortcuts';
import type { FieldShortcutMoveId, ShortcutItemEntry, ShortcutMoveEntry, ShortcutMoveRules } from '../rules/field-shortcuts';
import type { Inventory } from '../rules/inventory';
import type { ItemCatalog } from '../rules/item-catalog';
import type { Member } from '../rules/types';
import { clone } from '../rules/value';
import { semanticFingerprint } from '../rules/semantic';

export type FieldShortcutSelection = { readonly kind: 'item'; readonly itemId: string }
  | { readonly kind: 'move'; readonly memberId: string; readonly moveId: FieldShortcutMoveId };
export interface FieldShortcutMoveEntry extends ShortcutMoveEntry { readonly memberName: string }
type QueryRefusal = 'shortcut-query-stale' | 'joint-query-observation-required' | 'invalid-query-observation';
export interface FieldShortcutSnapshot {
  readonly items: readonly ShortcutItemEntry[]; readonly moves: readonly FieldShortcutMoveEntry[];
  readonly status?: 'stale'; readonly reason?: QueryRefusal;
}
export type FieldShortcutResolution = { readonly status: 'available'; readonly selection: FieldShortcutSelection }
  | { readonly status: 'refused'; readonly reason: string };
export interface FieldShortcutQueries {
  snapshot(memberId?: string): FieldShortcutSnapshot;
  resolve(selection: unknown, memberId?: string): FieldShortcutResolution;
}
export interface QueryObservation {
  readonly state: { readonly inventory: Inventory; readonly party: readonly Member[] };
  readonly catalog: ItemCatalog;
  /** Deterministic identity of all qualification facts outside state/catalog; never an execution capability. */
  readonly eligibilityIdentity: string;
}
export interface FieldShortcutQueryOptions {
  /**
   * The actual parent atomically captures one current, plain-data state/content/qualification observation.
   * It must finish its callbacks before capturing the aggregate, and cannot wrap sequential read/catalog
   * return values as if they were a joint observation. No live accessors or business RNG are permitted.
   */
  observe?(): QueryObservation;
  /** Legacy constructor fields remain source-compatible, but are never called or accepted as joint evidence. */
  read?(): { readonly inventory: Inventory; readonly party: readonly Member[]; readonly eligibilityIdentity?: string };
  catalog?(): ItemCatalog;
  /** Absence never creates an executable item; collection itself does not require a handler (WP27). */
  hasItemHandler?(itemId: string): boolean;
  abilities?: ShortcutMoveRules;
  itemName?(itemId: string): string;
  memberName?(member: Readonly<Member>): string;
}
function ownData(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && 'value' in descriptor ? descriptor.value : undefined;
}
/** Copies only validated identity fields. Neither this DTO nor an available result grants execution. */
export function fieldShortcutSelection(value: unknown): FieldShortcutSelection | null {
  const kind = ownData(value, 'kind');
  if (kind === 'item') {
    const itemId = ownData(value, 'itemId');
    return typeof itemId === 'string' && itemId.length > 0 ? { kind, itemId } : null;
  }
  if (kind === 'move') {
    const memberId = ownData(value, 'memberId'), moveId = ownData(value, 'moveId');
    return typeof memberId === 'string' && memberId.length > 0 && typeof moveId === 'string' && isFieldShortcutMoveId(moveId) ? { kind, memberId, moveId } : null;
  }
  return null;
}

export class FieldShortcutQuery implements FieldShortcutQueries {
  private readonly options: FieldShortcutQueryOptions;
  constructor(options: FieldShortcutQueryOptions) { this.options = options; }
  private observe(): { status: 'value'; value: QueryObservation; identity: string } | { status: 'refused'; reason: QueryRefusal } {
    if (!this.options.observe) return { status: 'refused', reason: 'joint-query-observation-required' };
    try {
      const raw = this.options.observe();
      // Validate plain data before copying, so getters cannot run between capture and comparison.
      const identity = semanticFingerprint(raw), value = clone(raw);
      if (!value.state || !value.state.inventory || !Array.isArray(value.state.party) || !value.catalog || typeof value.eligibilityIdentity !== 'string' || !value.eligibilityIdentity.length) return { status: 'refused', reason: 'invalid-query-observation' };
      return { status: 'value', value, identity };
    } catch { return { status: 'refused', reason: 'invalid-query-observation' }; }
  }
  private fresh(identity: string): QueryRefusal | null {
    // This is the last external call. Everything after the joint capture is pure comparison/return.
    const final = this.observe();
    return final.status === 'refused' ? final.reason : final.identity === identity ? null : 'shortcut-query-stale';
  }
  snapshot(memberId?: string): FieldShortcutSnapshot {
    const observation = this.observe();
    if (observation.status === 'refused') return { items: [], moves: [], status: 'stale', reason: observation.reason };
    const { state, catalog } = observation.value;
    const party = memberId === undefined ? state.party : state.party.filter(member => member.id === memberId);
    const items = memberId === undefined ? collectShortcutItems(state.inventory.registeredItems, state.inventory, catalog, this.options.itemName) : [];
    const moves = collectShortcutMoves(party, this.options.abilities).map(entry => {
      const member = party.find(candidate => candidate.id === entry.memberId)!;
      return { ...entry, memberName: this.options.memberName?.(member) ?? member.nickname ?? member.species };
    });
    const reason = this.fresh(observation.identity);
    return reason ? { items: [], moves: [], status: 'stale', reason } : { items, moves };
  }
  resolve(value: unknown, memberId?: string): FieldShortcutResolution {
    const selection = fieldShortcutSelection(value);
    if (!selection) return { status: 'refused', reason: 'invalid-shortcut-selection' };
    const observation = this.observe();
    if (observation.status === 'refused') return observation;
    const { state, catalog } = observation.value;
    if (selection.kind === 'item') {
      if (memberId !== undefined) return { status: 'refused', reason: 'shortcut-no-longer-available' };
      const items = collectShortcutItems(state.inventory.registeredItems, state.inventory, catalog);
      if (!items.some(item => item.itemId === selection.itemId)) return { status: 'refused', reason: 'shortcut-no-longer-available' };
      if (!this.options.hasItemHandler?.(selection.itemId)) return { status: 'refused', reason: 'field-handler-unavailable' };
    } else if (memberId !== undefined && memberId !== selection.memberId || !this.options.abilities || !resolveShortcutMove(selection, state.party, this.options.abilities)) {
      return { status: 'refused', reason: 'shortcut-no-longer-available' };
    }
    const reason = this.fresh(observation.identity);
    return reason ? { status: 'refused', reason } : { status: 'available', selection };
  }
}
