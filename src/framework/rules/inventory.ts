/** Eight ordered pockets. All public resource changes return a complete plan or throw without touching input. */
import { clone } from './value.ts';
import { own, setOwn } from './own.ts';
import { catalogOf, itemForBattleId, itemForLegacyId, itemOf } from './item-catalog.ts';
import type { ItemCatalog } from './item-catalog.ts';
import type { Content } from './types.ts';
import type { Limits } from './limits.ts';
import { resolveConfig } from './config.ts';

export interface InventorySlot { itemId: string; quantity: number }
export interface Inventory { pockets: InventorySlot[][]; lastPocket: number; indices: number[] }
export interface InventoryPolicy { perSlot: number; pocketSlots: readonly number[]; autoSort: readonly boolean[] }
export class InventoryRefused extends Error {
  readonly reason: string;
  constructor(reason: string, detail = reason) { super(detail); this.reason = reason; this.name = 'InventoryRefused'; }
}
export const newInventory = (): Inventory => ({ pockets: Array.from({ length: 8 }, () => []), lastPocket: 1, indices: Array(8).fill(0) as number[] });
export function inventoryPolicy(content?: Pick<Content, 'settings'>, limits?: Limits): InventoryPolicy {
  const config = resolveConfig(content?.settings);
  return { perSlot: typeof content?.settings?.BAG_MAX_PER_SLOT === 'number' ? config.BAG_MAX_PER_SLOT : limits?.bagPerItem ?? config.BAG_MAX_PER_SLOT, pocketSlots: config.BAG_POCKET_SLOTS, autoSort: config.BAG_AUTO_SORT };
}
export const positiveQuantity = (q: number): void => { if (!Number.isSafeInteger(q) || q < 1) throw new InventoryRefused('invalid-quantity'); };
export function safeAdd(a: number, b: number): number {
  const n = a + b;
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || !Number.isSafeInteger(n)) throw new InventoryRefused('integer-overflow');
  return n;
}
export function aggregateBag(inventory: Inventory): Record<string, number> {
  const out: Record<string, number> = {};
  for (const pocket of inventory.pockets) for (const slot of pocket) setOwn(out, slot.itemId, safeAdd(own(out, slot.itemId) ?? 0, slot.quantity));
  return out;
}
export function itemQuantity(inventory: Inventory, id: string, catalog: ItemCatalog): number {
  const item = itemOf(catalog, id);
  return !item ? 0 : inventory.pockets[item.pocket - 1]!.reduce((sum, slot) => slot.itemId === id ? safeAdd(sum, slot.quantity) : sum, 0);
}
/** Refuse unresolved existing identities before any inventory write; pocket replacement remains legal. */
export function assertInventoryMapped(inventory: Inventory,catalog:ItemCatalog):void {
  for(const pocket of inventory.pockets)for(const slot of pocket)if(!itemOf(catalog,slot.itemId))throw new InventoryRefused('unmapped-item',slot.itemId);
}
function requireItem(catalog: ItemCatalog, id: string) {
  const item = itemOf(catalog, id);
  if (!item || !Number.isInteger(item.pocket) || item.pocket < 1 || item.pocket > 8) throw new InventoryRefused('unknown-item', id);
  return item;
}
function checkPolicy(policy: InventoryPolicy): void {
  if (!Number.isSafeInteger(policy.perSlot) || policy.perSlot < 1 || policy.perSlot > 9999 || policy.pocketSlots.length !== 8 || policy.pocketSlots.some(n => !Number.isSafeInteger(n) || n < -1) || policy.autoSort.length !== 8) throw new InventoryRefused('invalid-inventory-policy');
}
export function capacityFor(inventory: Inventory, id: string, catalog: ItemCatalog, policy: InventoryPolicy): number {
  checkPolicy(policy);
  const item = requireItem(catalog, id), pocket = inventory.pockets[item.pocket - 1]!;
  const free = pocket.filter(slot => slot.itemId === id).reduce((n, slot) => safeAdd(n, Math.max(0, policy.perSlot - slot.quantity)), 0);
  const cap = policy.pocketSlots[item.pocket - 1]!;
  if (cap >= 0 && pocket.length > cap) return 0;
  if (cap === -1) return Number.MAX_SAFE_INTEGER - itemQuantity(inventory, id, catalog);
  return Math.min(Number.MAX_SAFE_INTEGER - itemQuantity(inventory, id, catalog), safeAdd(free, Math.max(0, cap - pocket.length) * policy.perSlot));
}
export function addItems(inventory: Inventory, id: string, quantity: number, catalog: ItemCatalog, policy: InventoryPolicy): Inventory {
  positiveQuantity(quantity);
  assertInventoryMapped(inventory,catalog);
  const item = requireItem(catalog, id);
  if (quantity > capacityFor(inventory, id, catalog, policy)) throw new InventoryRefused('inventory-full');
  const next = clone(inventory), pocket = next.pockets[item.pocket - 1]!;
  let left = quantity;
  for (const slot of pocket) if (slot.itemId === id) { const n = Math.min(left, Math.max(0, policy.perSlot - slot.quantity)); slot.quantity += n; left -= n; }
  if (Math.ceil(left / policy.perSlot) + pocket.length > 0xffffffff) throw new InventoryRefused('inventory-size-overflow');
  while (left > 0) { const n = Math.min(left, policy.perSlot); pocket.push({ itemId: id, quantity: n }); left -= n; }
  if (policy.autoSort[item.pocket - 1]) pocket.sort((a, b) => requireItem(catalog, a.itemId).order - requireItem(catalog, b.itemId).order);
  return next;
}
export function removeItems(inventory: Inventory, id: string, quantity: number, catalog: ItemCatalog): Inventory {
  positiveQuantity(quantity);
  assertInventoryMapped(inventory,catalog);
  const item = requireItem(catalog, id);
  if (itemQuantity(inventory, id, catalog) < quantity) throw new InventoryRefused('not-enough-items');
  const next = clone(inventory), pocket = next.pockets[item.pocket - 1]!;
  let left = quantity;
  for (const slot of pocket) if (slot.itemId === id) { const n = Math.min(left, slot.quantity); slot.quantity -= n; left -= n; }
  next.pockets[item.pocket - 1] = pocket.filter(slot => slot.quantity > 0);
  return next;
}
/** WP27 replacement changes identities in the old pocket only; it never merges, sorts or relocates slots. */
export function replaceItemId(inventory: Inventory, oldId: string, newId: string, catalog: ItemCatalog): Inventory {
  const old = requireItem(catalog, oldId); requireItem(catalog, newId);
  const next = clone(inventory);
  for (const slot of next.pockets[old.pocket - 1]!) if (slot.itemId === oldId) slot.itemId = newId;
  return next;
}
export function moveInventorySlot(inventory: Inventory,pocket:number,from:number,to:number,policy:InventoryPolicy):Inventory {
  if(!Number.isInteger(pocket)||pocket<1||pocket>8||policy.autoSort[pocket-1])throw new InventoryRefused('sorting-disabled');
  const rows=inventory.pockets[pocket-1]!;
  if(![from,to].every(i=>Number.isInteger(i)&&i>=0&&i<rows.length))throw new InventoryRefused('invalid-slot');
  const next=clone(inventory),list=next.pockets[pocket-1]!;list.splice(to,0,...list.splice(from,1));return next;
}
export function inventoryFromBag(bag: Record<string, number>, catalog: ItemCatalog = catalogOf(), policy = inventoryPolicy()): Inventory {
  let result = newInventory();
  for (const [id, quantity] of Object.entries(bag)) {
    const item = itemForLegacyId(catalog, id);
    if (!item) throw new InventoryRefused('unmapped-item', id);
    result = addItems(result, item.id, quantity, catalog, policy);
  }
  return result;
}
/** Only explicit battle identities enter a session. Ordinary field/key items never become battle actions. */
export function battleBag(inventory: Inventory, catalog: ItemCatalog): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, n] of Object.entries(aggregateBag(inventory))) {
    const item = requireItem(catalog, id);
    if (item.battleId) setOwn(out, item.battleId, safeAdd(own(out, item.battleId) ?? 0, n));
  }
  return out;
}
export function applyBattleBag(inventory: Inventory, delta: Record<string, number>, catalog: ItemCatalog, policy: InventoryPolicy): Inventory {
  assertInventoryMapped(inventory,catalog);
  let next = inventory;
  for (const [battleId, n] of Object.entries(delta)) {
    if (!Number.isSafeInteger(n)) throw new InventoryRefused('invalid-bag-delta');
    const item = itemForBattleId(catalog, battleId);
    if (!item) throw new InventoryRefused('unmapped-battle-item', battleId);
    if (n > 0) next = addItems(next, item.id, n, catalog, policy);
    if (n < 0) next = removeItems(next, item.id, -n, catalog);
  }
  return next;
}
export function inventoryProblems(raw: unknown): { path: string; message: string }[] {
  const out: { path: string; message: string }[] = [], obj = raw as Partial<Inventory> | null;
  const fail = (path: string, message: string) => { out.push({ path: `$.inventory${path}`, message }); };
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return [{ path: '$.inventory', message: 'must be an inventory' }];
  if (Object.keys(obj).some(k => !['pockets', 'lastPocket', 'indices'].includes(k))) fail('', 'unknown inventory field');
  if (!Number.isInteger(obj.lastPocket) || obj.lastPocket! < 1 || obj.lastPocket! > 8) fail('.lastPocket', 'must be 1..8');
  if (!Array.isArray(obj.indices) || obj.indices.length !== 8 || obj.indices.some(n => !Number.isSafeInteger(n) || n < 0)) fail('.indices', 'must be eight nonnegative safe indices');
  if (!Array.isArray(obj.pockets) || obj.pockets.length !== 8) fail('.pockets', 'must be eight pockets');
  else obj.pockets.forEach((pocket, i) => {
    if (!Array.isArray(pocket)) { fail(`.pockets[${i}]`, 'must be an ordered slot list'); return; }
    pocket.forEach((slot, j) => { if (!slot || typeof slot !== 'object' || Object.keys(slot).some(k => !['itemId','quantity'].includes(k)) || typeof slot.itemId !== 'string' || !slot.itemId || !Number.isSafeInteger(slot.quantity) || slot.quantity < 1) fail(`.pockets[${i}][${j}]`, 'must be {itemId,quantity>=1}'); });
  });
  if (!out.length) try { aggregateBag(obj as Inventory); } catch { fail('', 'aggregate quantity overflow'); }
  return out;
}
