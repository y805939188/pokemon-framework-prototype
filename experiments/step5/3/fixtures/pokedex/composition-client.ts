import { applyDexPatch, normalizeDexAppearance, planDexLastSeen } from "../../../../../src/framework/rules/pokedex.ts";
import type { DexAppearance } from "../../../../../src/framework/rules/pokedex.ts";
import type { Content, DexState } from "../../../../../src/framework/rules/types.ts";

/** The normalizer's structural subtype must remain a valid lastSeen input without assertions or copied fields. */
export function recentView(content: Pick<Content, "species" | "forms">, dex: DexState, individual: DexAppearance): DexState {
  const recent = normalizeDexAppearance(content, individual, "recent");
  if (!recent) return dex;
  return applyDexPatch(dex, planDexLastSeen(dex, recent.species, recent).patch);
}
