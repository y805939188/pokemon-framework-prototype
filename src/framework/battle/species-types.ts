/** Battle-local static species views. Native temporary types and species lifecycle remain engine-owned. */
import type { ShowdownBattle, ShowdownPokemon } from './showdown-types';

export type SpeciesTypes = Readonly<Record<string, readonly string[]>>;

/** Installed before Pokemon construction. The shared Dex, its species objects and author content are untouched. */
export function bindSpeciesTypes(battle: ShowdownBattle, table: SpeciesTypes | undefined): void {
  if (!table) return;
  const native = battle.dex;
  const supported = new Set(native.types.all().filter((type: ShowdownPokemon) => type.exists && !type.isPseudoType && type.isNonstandard !== 'Future').map((type: ShowdownPokemon) => type.name));
  const overrides: Record<string, string[]> = {};
  const views = new Map<string, ShowdownPokemon>();
  for (const [name, authored] of Object.entries(table)) {
    const species = native.species.get(name);
    if (!species.exists || !Array.isArray(authored)) throw new Error('invalid-battle-species-types');
    // Future types were incidentally accepted by the author adapter, outside its Gen8 directory.
    // Keep their previous native battle behaviour pending the explicit compatibility decision.
    if (!authored.every(type => supported.has(type))) continue;
    const types = [...new Set(authored.length ? authored : ['Normal'])];
    if (types.length === species.types.length && types.every((type, i) => type === species.types[i])) continue;
    overrides[species.id] = types;
    views.set(species.id, Object.assign(Object.create(Object.getPrototypeOf(species)), species, { types: [...types] }));
  }
  if (!views.size) return;
  const species = Object.create(native.species);
  const view = (value: ShowdownPokemon): ShowdownPokemon => views.get(value.id) ?? value;
  Object.defineProperties(species, {
    get: { value: (name: unknown) => view(native.species.get(name)) },
    getByID: { value: (id: string) => view(native.species.getByID(id)) },
    all: { value: () => native.species.all().map(view) },
  });
  const dex = Object.create(native);
  Object.defineProperty(dex, 'species', { value: species });
  battle.dex = dex;
  // Plain battle snapshot data, never Member/save data. Default content adds no field or view.
  battle.rpgSpeciesTypes = overrides;
}

/** Native State encodes Species by ID. Resolve those same references in the restored battle's local view.
 * Current types/addedType, Transform copies, moves and all other decoded native objects are retained. */
export function restoreSpeciesTypes(battle: ShowdownBattle, state: ShowdownPokemon): void {
  if (!state.rpgSpeciesTypes) return;
  bindSpeciesTypes(battle, state.rpgSpeciesTypes);
  const rebind = (saved: ShowdownPokemon, live: ShowdownPokemon): void => {
    if (!saved || typeof saved !== 'object' || !live || typeof live !== 'object') return;
    for (const [key, value] of Object.entries(saved)) {
      if (typeof value === 'string' && value.startsWith('[Species:') && value.endsWith(']')) {
        live[key] = battle.dex.species.get(value.slice(9, -1));
      } else if (value && typeof value === 'object') rebind(value, live[key]);
    }
  };
  rebind(state, battle);
  // Native State serializes the queue's list, rather than its BattleQueue wrapper.
  rebind(state.queue, battle.queue.list);
}
