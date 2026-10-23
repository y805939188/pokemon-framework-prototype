/** Validation shared by authored JSON and the compiled-content consumption gate; never queries Dex. */
import { ITEM_ID, importantItem, legacyCatalog } from '../rules/item-catalog.ts';
import type { FieldUse, ItemCatalog, ItemDefinition, ShopDefinition } from '../rules/item-catalog.ts';
import { setOwn } from '../rules/own.ts';
import type { ContentError } from './schema.ts';
import { fieldEffectProblem } from '../rules/item-families.ts';

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const integer = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(s => typeof s === 'string' && s.length > 0);
export function checkItemInputs(rawItems: unknown, rawShops: unknown, usable: (id: unknown) => string | null): { items: ItemDefinition[]; shops: ShopDefinition[]; errors: ContentError[]; catalog: ItemCatalog } {
  const items: ItemDefinition[] = [], shops: ShopDefinition[] = [], errors: ContentError[] = [];
  const problem = (file: ContentError['file'], path: string, message: string) => { errors.push({ file, path, message }); };
  const catalog: ItemCatalog = rawItems === undefined ? legacyCatalog() : {};
  const ids = new Set<string>(), battleIds = new Set<string>(), legacyIds = new Set<string>();
  if (rawItems !== undefined && !Array.isArray(rawItems)) problem('items.json', '$', 'must be an array');
  for (const [i, raw] of (Array.isArray(rawItems) ? rawItems : []).entries()) {
    const p = `$[${i}]`, before = errors.length;
    if (!object(raw)) { problem('items.json', p, 'must be an item record'); continue; }
    const known = ['id','name','namePlural','nameKey','pluralKey','descriptionKey','pocket','order','price','sellPrice','flags','fieldUse','battleUse','battleId','legacyIds','consumable','showQuantity','move','effect','source'];
    for (const key of Object.keys(raw)) if (!known.includes(key)) problem('items.json', `${p}.${key}`, 'unknown item field');
    const id = raw.id;
    if (typeof id !== 'string' || !ITEM_ID.test(id) || ids.has(id)) problem('items.json', `${p}.id`, 'invalid or duplicate item id');
    else ids.add(id);
    const sourceProblem = usable(raw.source); if (sourceProblem) problem('items.json', `${p}.source`, sourceProblem);
    for (const key of ['name','namePlural','nameKey','pluralKey','descriptionKey']) if (raw[key] !== undefined && typeof raw[key] !== 'string') problem('items.json', `${p}.${key}`, 'must be a string (empty translations are retained)');
    if (raw.pocket !== undefined && (!integer(raw.pocket) || raw.pocket < 1 || raw.pocket > 8)) problem('items.json', `${p}.pocket`, 'must be 1..8');
    for (const key of ['order','price','sellPrice']) if (raw[key] !== undefined && !integer(raw[key])) problem('items.json', `${p}.${key}`, 'must be a nonnegative safe integer');
    if (raw.flags !== undefined && !strings(raw.flags)) problem('items.json', `${p}.flags`, 'must be string flags');
    if (raw.fieldUse !== undefined && (typeof raw.fieldUse !== 'string' || !['none','member','direct','field','tm','hm','tr'].includes(raw.fieldUse))) problem('items.json', `${p}.fieldUse`, 'must be a registered field use string');
    if (raw.battleUse !== undefined && (typeof raw.battleUse !== 'string' || !['none','member','move','active','foe','direct','ball'].includes(raw.battleUse))) problem('items.json', `${p}.battleUse`, 'must be a registered battle use string');
    for (const key of ['consumable','showQuantity']) if (raw[key] !== undefined && typeof raw[key] !== 'boolean') problem('items.json', `${p}.${key}`, 'must be boolean');
    for (const key of ['move','battleId']) if (raw[key] !== undefined && (typeof raw[key] !== 'string' || !ITEM_ID.test(raw[key]))) problem('items.json', `${p}.${key}`, 'must be a stable data id');
    if (typeof raw.fieldUse === 'string' && ['tm','hm','tr'].includes(raw.fieldUse) && typeof raw.move !== 'string') problem('items.json', `${p}.move`, 'machines require an explicit move identity');
    if (typeof raw.battleId === 'string') { if (battleIds.has(raw.battleId)) problem('items.json', `${p}.battleId`, 'ambiguous battle id'); battleIds.add(raw.battleId); }
    if (raw.legacyIds !== undefined && (!strings(raw.legacyIds) || raw.legacyIds.some(id => !ITEM_ID.test(id)))) problem('items.json', `${p}.legacyIds`, 'must be stable legacy ids');
    if (strings(raw.legacyIds)) for (const legacy of raw.legacyIds) { if (legacyIds.has(legacy)) problem('items.json', `${p}.legacyIds`, 'ambiguous legacy id'); legacyIds.add(legacy); }
    if (raw.effect !== undefined) {
      const e = raw.effect;
      if (!object(e) || typeof e.family !== 'string' || !e.family || !object(e.parameters) || Object.keys(e).some(k => !['family','parameters'].includes(k)) || Object.values(e.parameters).some(v => !['string','number','boolean'].includes(typeof v) || typeof v === 'number' && !Number.isSafeInteger(v))) problem('items.json', `${p}.effect`, 'must be {family,parameters} with plain scalar parameters');
      else {const invalid=fieldEffectProblem(e as unknown as NonNullable<ItemDefinition['effect']>);if(invalid)problem('items.json',`${p}.effect.parameters`,invalid);}
    }
    if (errors.length !== before) continue;
    const item: ItemDefinition = { id: id as string, name: raw.name as string ?? 'Unnamed', namePlural: raw.namePlural as string ?? 'Unnamed', pocket: raw.pocket as number ?? 1,
      order: raw.order as number ?? i, price: raw.price as number ?? 0, sellPrice: raw.sellPrice as number ?? Math.floor((raw.price as number ?? 0) / 2),
      flags: raw.flags as string[] ?? [], fieldUse: raw.fieldUse as FieldUse ?? 'none', battleUse: raw.battleUse as ItemDefinition['battleUse'] ?? 'none',
      legacyIds: raw.legacyIds as string[] ?? [], consumable: raw.consumable as boolean ?? true, source: raw.source as string };
    for (const key of ['nameKey','pluralKey','descriptionKey','battleId','showQuantity','move','effect'] as const) if (raw[key] !== undefined) Object.defineProperty(item, key, { value: JSON.parse(JSON.stringify(raw[key])), enumerable: true, writable: true, configurable: true });
    if (raw.consumable === undefined && importantItem(item)) item.consumable = false;
    items.push(item); setOwn(catalog, item.id, item);
  }
  for (const item of items) for (const id of item.legacyIds) if (id !== item.id && Object.hasOwn(catalog, id)) problem('items.json', item.id, `legacy id ${id} conflicts with a current item`);
  const shopIds = new Set<string>();
  if (rawShops !== undefined && !Array.isArray(rawShops)) problem('shops.json', '$', 'must be an array');
  for (const [i, raw] of (Array.isArray(rawShops) ? rawShops : []).entries()) {
    const p = `$[${i}]`, before = errors.length;
    if (!object(raw)) { problem('shops.json', p, 'must be a shop'); continue; }
    if (Object.keys(raw).some(k => !['id','stock','allowSell','overrides','greetingKey','farewellKey','source'].includes(k))) problem('shops.json', p, 'unknown shop field');
    if (typeof raw.id !== 'string' || !ITEM_ID.test(raw.id) || shopIds.has(raw.id)) problem('shops.json', `${p}.id`, 'invalid or duplicate shop id'); else shopIds.add(raw.id);
    if (!strings(raw.stock) || raw.stock.some(id => !Object.hasOwn(catalog, id))) problem('shops.json', `${p}.stock`, 'must list known item ids');
    if (raw.allowSell !== undefined && typeof raw.allowSell !== 'boolean') problem('shops.json', `${p}.allowSell`, 'must be boolean');
    for (const key of ['greetingKey','farewellKey']) if (raw[key] !== undefined && typeof raw[key] !== 'string') problem('shops.json', `${p}.${key}`, 'must be a text key');
    if (raw.overrides !== undefined && (!object(raw.overrides) || Object.entries(raw.overrides).some(([id,value]) => !Object.hasOwn(catalog,id) || !object(value) || Object.keys(value).some(k=>!['buy','sell'].includes(k)) || ![value.buy,value.sell].every(n=>Number.isSafeInteger(n) && (n as number)>=-1)))) problem('shops.json',`${p}.overrides`,'must map known items to safe buy/sell slots (-1 or nonnegative)');
    const gate = usable(raw.source); if (gate) problem('shops.json', `${p}.source`, gate);
    if (before === errors.length) shops.push({ ...(raw as unknown as ShopDefinition), allowSell: raw.allowSell as boolean ?? true });
  }
  return { items, shops, catalog, errors };
}
