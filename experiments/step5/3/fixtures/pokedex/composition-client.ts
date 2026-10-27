import { pokedex } from "../../../../../src/framework/rules/index.ts";
import type { DexAppearance, Content, DexState } from "../../../../../src/framework/rules/index.ts";
const { applyDexPatch, normalizeDexAppearance, planDexLastSeen } = pokedex;

/** The normalizer's structural subtype must remain a valid lastSeen input without assertions or copied fields. */
export function recentView(content: Pick<Content, "species" | "forms">, dex: DexState, individual: DexAppearance): DexState {
  const recent = normalizeDexAppearance(content, individual, "recent");
  if (!recent) return dex;
  return applyDexPatch(dex, planDexLastSeen(dex, recent.species, recent).patch);
}
