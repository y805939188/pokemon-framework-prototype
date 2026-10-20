/** Static Showdown data (species, moves) behind the small DexLookup interface the content layers use. */
import type { DexLookup } from "../rules/types.ts";
import { loadSim, readEngineSha } from "./showdown-loader.ts";

export function createDexLookup(engineRoot?: string): DexLookup {
  const { sim, root } = loadSim(engineRoot);
  const dex = sim.Dex;
  // Battles run the [Gen 8] format, so the data a member is created from must be Gen 8's too (the base dex is the newest
  // generation: e.g. Rest and Roost have 5 PP there and 10 in Gen 8, and the engine refuses a mismatching PP maximum).
  const gen8 = dex.forGen(8);
  const sha = readEngineSha(root);
  return {
    species(id) {
      const s = gen8.species.get(id);
      if (!s || !s.exists) return null;
      const slots = s.abilities as Record<string, string | undefined>;
      const abilities = [slots["0"], slots["1"]].filter((a): a is string => typeof a === "string" && a.length > 0);
      // single-gender / genderless species name a fixed gender; the others give the female share (WP19 §3.2: out of 256)
      const gender = s.gender === "M" || s.gender === "F" || s.gender === "N" ? s.gender : Math.round((s.genderRatio as { F: number }).F * 256);
      return { name: s.name as string, baseStats: { ...s.baseStats }, abilities, gender };
    },
    move(id) {
      const m = gen8.moves.get(id);
      return m && m.exists ? { name: m.name as string, id: m.id as string, pp: m.pp as number } : null;
    },
    levelUpMoves(id) {
      const data = dex.species.getLearnsetData(id);
      if (!data || !data.exists || !data.learnset) return null;
      const out: Record<string, number[]> = {};
      for (const [moveId, sources] of Object.entries(data.learnset as Record<string, string[]>)) {
        const levels = sources.filter((s) => /^8L\d+$/.test(s)).map((s) => Number(s.slice(2)));
        if (levels.length) out[moveId] = levels;
      }
      return out;
    },
    sha: () => sha,
  };
}
