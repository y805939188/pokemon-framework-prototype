/** Item identity belongs to content; battle IDs, prices and display names are independent. */
import { FIELD_EFFECTS } from './item-families.ts';
import { BAG_ITEMS, BALLS } from './items.ts';
import { own, setOwn } from './own.ts';

export type FieldUse = 'none' | 'member' | 'direct' | 'field' | 'tm' | 'hm' | 'tr';
export interface ItemDefinition {
  id: string;
  name: string;
  namePlural: string;
  nameKey?: string;
  pluralKey?: string;
  descriptionKey?: string;
  pocket: number;
  order: number;
  price: number;
  sellPrice: number;
  flags: string[];
  fieldUse: FieldUse;
  battleUse: 'none' | 'member' | 'move' | 'active' | 'foe' | 'direct' | 'ball';
  battleId?: string;
  legacyIds: string[];
  consumable: boolean;
  showQuantity?: boolean;
  move?: string;
  effect?: { family: string; parameters: Record<string, string | number | boolean> };
  source: string;
}
export type ItemCatalog = Record<string, ItemDefinition>;
export interface ShopDefinition { id: string; stock: string[]; allowSell: boolean; overrides?: Record<string, {buy:number;sell:number}>; greetingKey?: string; farewellKey?: string; source: string }
export const ITEM_ID = /^[A-Za-z0-9#._:-]{1,64}$/;
export const hasFlag = (item: ItemDefinition, flag: string): boolean => item.flags.some(f => f.toLowerCase() === flag.toLowerCase());
export const importantItem = (item: ItemDefinition): boolean => ['tm','hm'].includes(item.fieldUse) || ['KeyItem', 'TM', 'HM'].some(flag => hasFlag(item, flag));
export const consumesItem = (item: ItemDefinition): boolean => !importantItem(item) && item.consumable;
export const showsQuantity = (item: ItemDefinition): boolean => !importantItem(item) || item.showQuantity === true;
export const holdableItem = (item: ItemDefinition): boolean => !importantItem(item) && !hasFlag(item, 'Mail') && !hasFlag(item, 'Unholdable');

/** Compatibility identity for content predating items.json. Price zero is an author default, not Showdown data. */
export function legacyCatalog(): ItemCatalog {
  const catalog: ItemCatalog = {};
  BAG_ITEMS.forEach((id, order) => {
    const ball = BALLS.includes(id), active = id.startsWith('x') || id === 'direhit' || id === 'guardspec';
    setOwn<ItemDefinition>(catalog, id, { id, name: 'Unnamed', namePlural: 'Unnamed', pocket: ball ? 3 : active ? 7 : 2, order,
      price: 0, sellPrice: 0, flags: ball ? ['PokeBall'] : [], fieldUse: 'none', battleUse: ball ? 'ball' : active ? 'active' : 'member',
      battleId: id, legacyIds: [id], consumable: true, source: 'framework-legacy' });
  });
  // Explicit compatibility for the previously exercised held-item path. No price or field effect is inferred.
  for (const [id,pocket] of [['leftovers',1],['choiceband',1],['oranberry',5],['sitrusberry',5]] as const) {
    setOwn<ItemDefinition>(catalog,id,{id,name:'Unnamed',namePlural:'Unnamed',pocket,order:Object.keys(catalog).length,price:0,sellPrice:0,flags:pocket===5?['Berry']:[],fieldUse:'none',battleUse:'none',legacyIds:[id],consumable:true,source:'framework-legacy'});
  }
  for (const [id,effect] of Object.entries(FIELD_EFFECTS)) {
    const previous=own(catalog,id),berry=id.endsWith('berry');
    setOwn<ItemDefinition>(catalog,id,{id,name:'Unnamed',namePlural:'Unnamed',pocket:berry?5:2,order:Object.keys(catalog).length,price:0,sellPrice:0,flags:berry?['Berry']:[],battleUse:'none',legacyIds:[id],consumable:true,source:'framework-spec-derived',...previous,fieldUse:effect.family==='sacred-ash'?'direct':'member',effect:JSON.parse(JSON.stringify(effect)) as ItemDefinition['effect']});
  }
  setOwn<ItemDefinition>(catalog,'premierball',{id:'premierball',name:'Unnamed',namePlural:'Unnamed',pocket:3,order:Object.keys(catalog).length,price:0,sellPrice:0,flags:['PokeBall','PremierBall'],fieldUse:'none',battleUse:'none',legacyIds:['premierball'],consumable:true,source:'framework-spec-derived'});
  setOwn<ItemDefinition>(catalog,'box-link',{id:'box-link',name:'Unnamed',namePlural:'Unnamed',pocket:8,order:Object.keys(catalog).length,price:0,sellPrice:0,flags:['KeyItem','BoxLink'],fieldUse:'none',battleUse:'none',legacyIds:[],consumable:false,source:'framework-spec-derived'});
  return catalog;
}
const LEGACY = legacyCatalog();
export const catalogOf = (content?: {items?:ItemCatalog}): ItemCatalog => content?.items ?? structuredCatalog(LEGACY);
export const itemOf = (catalog: ItemCatalog, id: string): ItemDefinition | undefined => { const item = own(catalog, id); return item ? structuredItem(item) : undefined; };
export function itemForLegacyId(catalog: ItemCatalog, id: string): ItemDefinition | undefined {
  const item = own(catalog, id) ?? Object.values(catalog).find(item => item.legacyIds.includes(id));
  return item ? structuredItem(item) : undefined;
}
export function itemForBattleId(catalog: ItemCatalog, id: string): ItemDefinition | undefined {
  const item = Object.values(catalog).find(item => item.battleId === id);
  return item ? structuredItem(item) : undefined;
}

/** Explicit handlers win; conditional handlers keep registration order; copying resolves the source now. */
export class ItemEffectRegistry<T> {
  private readonly explicit = new Map<string, T>();
  private readonly conditional: { matches: (item: ItemDefinition) => boolean; handler: T }[] = [];
  register(id: string, handler: T): void { this.explicit.set(id, handler); }
  registerWhen(matches: (item: ItemDefinition) => boolean, handler: T): void { this.conditional.push({ matches, handler }); }
  get(item: ItemDefinition): T | undefined { return this.explicit.get(item.id) ?? this.conditional.find(entry => entry.matches(structuredItem(item)))?.handler; }
  copy(from: ItemDefinition, toId: string): void { const found = this.get(from); if (found === undefined) throw new Error('missing-effect-source'); this.explicit.set(toId, found); }
}
const structuredItem = (item: ItemDefinition): ItemDefinition => JSON.parse(JSON.stringify(item)) as ItemDefinition;

function structuredCatalog(catalog: ItemCatalog): ItemCatalog { return JSON.parse(JSON.stringify(catalog)) as ItemCatalog; }
