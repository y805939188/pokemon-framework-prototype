/** Static Showdown data (species, moves) behind the small DexLookup interface the content layers use. */
import type { DexLookup } from "../rules/types.ts";
import { loadSim, readEngineSha } from "./showdown-loader.ts";

export function createDexLookup(engineRoot?: string): DexLookup {
  const { sim, root } = loadSim(engineRoot);
  const dex = sim.Dex;
  const sha = readEngineSha(root);
  return {
    species(id) {
      const s = dex.species.get(id);
      return s && s.exists ? { name: s.name as string, baseStats: { ...s.baseStats } } : null;
    },
    move(id) {
      const m = dex.moves.get(id);
      return m && m.exists ? { name: m.name as string } : null;
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
