/** WP27/WP59 shortcut registration and current-party projections. No persistent or UI owner lives here. */
import type { Inventory } from './inventory';
import { itemQuantity } from './inventory';
import type { ItemCatalog } from './item-catalog';
import { importantItem, itemOf } from './item-catalog';
import type { Member } from './types';

export const SHORTCUT_MOVE_IDS = ['cut', 'dig', 'dive', 'flash', 'fly', 'headbutt', 'rocksmash', 'strength', 'surf', 'sweetscent', 'teleport', 'waterfall', 'defog', 'rockclimb', 'secretpower', 'whirlpool'] as const;
export const APPROVED_FIELD_MOVE_IDS = ['cut', 'rocksmash', 'strength', 'surf', 'flash', 'fly', 'dig', 'teleport', 'sweetscent'] as const;
export type FieldShortcutMoveId = (typeof APPROVED_FIELD_MOVE_IDS)[number];
export function isFieldShortcutMoveId(value: string): value is FieldShortcutMoveId {
  return APPROVED_FIELD_MOVE_IDS.some(id => id === value);
}
/** A direct registration only needs a current legal identity, not ownership or a handler. */
export function registerShortcutItem(registeredItems: readonly string[], itemId: string, catalog: ItemCatalog): string[] {
  if (!itemOf(catalog, itemId)) throw new RangeError('unknown-shortcut-item');
  return registeredItems.includes(itemId) ? [...registeredItems] : [...registeredItems, itemId];
}
export function unregisterShortcutItem(registeredItems: readonly string[], itemId: string): string[] {
  return registeredItems.filter(id => id !== itemId);
}
export type ShortcutRegistrationCommand = 'register' | 'unregister' | null;
export function shortcutRegistrationCommand(registeredItems: readonly string[], itemId: string, catalog: ItemCatalog, hasFieldHandler: (itemId: string) => boolean): ShortcutRegistrationCommand {
  if (registeredItems.includes(itemId)) return 'unregister';
  return itemOf(catalog, itemId) && hasFieldHandler(itemId) ? 'register' : null;
}
/** Registered key icons survive handler loss; empty icons require an actual field handler. */
export function shortcutRegistrationIcon(registeredItems: readonly string[], itemId: string, catalog: ItemCatalog, hasFieldHandler: (itemId: string) => boolean = () => false): 'registered' | 'unregistered' | null {
  const item = itemOf(catalog, itemId);
  return item && importantItem(item) ? registeredItems.includes(itemId) ? 'registered' : hasFieldHandler(itemId) ? 'unregistered' : null : null;
}
export interface ShortcutItemEntry { readonly kind: 'item'; readonly itemId: string; readonly name: string; readonly quantity: number }
export interface ShortcutMoveEntry { readonly kind: 'move'; readonly memberId: string; readonly moveId: FieldShortcutMoveId; readonly name: string }
export interface ShortcutMoveRules {
  /** Both handler availability and silent qualification must be supplied by the actual ability consumer. */
  hasHandler(moveId: FieldShortcutMoveId): boolean;
  canUse(member: Readonly<Member>, moveId: FieldShortcutMoveId): boolean;
  name(moveId: FieldShortcutMoveId): string;
}
function byName(a: { name: string }, b: { name: string }): number { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; }
export function collectShortcutItems(registeredItems: readonly string[], inventory: Inventory, catalog: ItemCatalog, name: (itemId: string) => string = id => itemOf(catalog, id)?.name ?? id): ShortcutItemEntry[] {
  const entries: ShortcutItemEntry[] = [];
  for (const itemId of registeredItems) {
    const quantity = itemQuantity(inventory, itemId, catalog);
    if (quantity > 0) entries.push({ kind: 'item', itemId, quantity, name: name(itemId) });
  }
  return entries.sort(byName);
}
export function collectShortcutMoves(party: readonly Member[], rules?: ShortcutMoveRules): ShortcutMoveEntry[] {
  if (!rules) return [];
  const entries: ShortcutMoveEntry[] = [];
  for (const moveId of SHORTCUT_MOVE_IDS) {
    if (!isFieldShortcutMoveId(moveId) || !rules.hasHandler(moveId)) continue;
    for (const member of party) {
      if (!member.isEgg && member.moves.some(move => move.id === moveId) && rules.canUse(member, moveId)) entries.push({ kind: 'move', memberId: member.id, moveId, name: rules.name(moveId) });
    }
  }
  return entries.sort(byName);
}
/** Resolve the stable identity again immediately before handing selection to the ability operation. */
export function resolveShortcutMove(entry: Pick<ShortcutMoveEntry, 'memberId' | 'moveId'>, party: readonly Member[], rules: ShortcutMoveRules): Readonly<Member> | null {
  if (!isFieldShortcutMoveId(entry.moveId) || !rules.hasHandler(entry.moveId)) return null;
  const member = party.find(candidate => candidate.id === entry.memberId);
  return member && !member.isEgg && member.moves.some(move => move.id === entry.moveId) && rules.canUse(member, entry.moveId) ? member : null;
}
