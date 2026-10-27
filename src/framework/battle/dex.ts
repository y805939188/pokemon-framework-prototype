/** Static Showdown data (species, moves) behind the small DexLookup interface the content layers use. */
import type { DexLookup } from "../rules/types.ts";
import { loadSim, readEngineSha } from "./showdown-loader.ts";

export function createDexLookup(engineRoot?: string): DexLookup {
  // Constructing the port must consume no external data. Content assembly checks the complete source registry before
  // its first lookup (including sha); only then may a method initialize Showdown and its generation data.
  const load = () => {
    const { sim, root } = loadSim(engineRoot);
    const dex = sim.Dex;
    // Battles run Gen 8: e.g. Rest/Roost have 10 PP here, versus 5 in the newest base dex.
    return { dex, gen8: dex.forGen(8), sha: readEngineSha(root) };
  };
  let loaded: ReturnType<typeof load> | undefined;
  const use = () => (loaded ??= load());
  return {
    species(id) {
      const s = use().gen8.species.get(id);
      if (!s || !s.exists) return null;
      const slots = s.abilities as Record<string, string | undefined>;
      const abilities = [slots["0"] ?? null, slots["1"] ?? null];
      // single-gender / genderless species name a fixed gender; the others give the female share (WP19 §3.2: out of 256)
      const gender = s.gender === "M" || s.gender === "F" || s.gender === "N" ? s.gender : Math.round((s.genderRatio as { F: number }).F * 256);
      return { name: s.name as string, baseSpecies: s.baseSpecies as string, types: [...s.types], baseStats: { ...s.baseStats }, abilities, hiddenAbilities: [slots["H"] ?? null], gender };
    },
    type(id) { const type = use().gen8.types.get(id); return type?.exists ? {name:type.name as string} : null; },
    allTypes() { return use().gen8.types.all().filter((t: {exists:boolean;isPseudoType?:boolean;isNonstandard?:string|null}) => t.exists && !t.isPseudoType && t.isNonstandard !== 'Future').map((t:{name:string})=>({name:t.name})); },
    allAbilities() { return use().gen8.abilities.all().filter((ability: {exists:boolean})=>ability.exists).map((ability:{id:string;name:string})=>({id:ability.id,name:ability.name})); },
    allMoves() { return use().gen8.moves.all().filter((m: {exists:boolean})=>m.exists).map((m:{id:string;name:string;pp:number})=>({id:m.id,name:m.name,pp:m.pp})); },
    move(id) {
      const m = use().gen8.moves.get(id);
      return m && m.exists ? { name: m.name as string, id: m.id as string, pp: m.pp as number } : null;
    },
    levelUpMoves(id) {
      const data = use().dex.species.getLearnsetData(id);
      if (!data || !data.exists || !data.learnset) return null;
      const out: Record<string, number[]> = {};
      for (const [moveId, sources] of Object.entries(data.learnset as Record<string, string[]>)) {
        const levels = sources.filter((s) => /^8L\d+$/.test(s)).map((s) => Number(s.slice(2)));
        if (levels.length) out[moveId] = levels;
      }
      return out;
    },
    abilityInfo(id) { const dex = use().gen8, ability = dex.abilities.get(id), text = ability?.exists ? dex.text.get(ability) : null; return text ? { name: ability.name, description: text.shortDesc || text.desc || "" } : null; },
    moveDetails(id) { const dex = use().gen8, move = dex.moves.get(id), text = move?.exists ? dex.text.get(move) : null; return text ? { name: move.name, type: move.type, category: move.category, power: move.basePowerCallback ? null : move.basePower, accuracy: move.accuracy === true ? 0 : move.accuracy, description: text.shortDesc || text.desc || "" } : null; },
    heldItem(id) { const item = use().gen8.items.get(id); return item && item.exists ? { holdable: true, mail: item.isMail === true } : null; },
    sha: () => use().sha,
  };
}
