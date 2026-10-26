/** Source-aware gift/grant registration and retained first-entry facts. No installation or UI work. */
import { applyDexPatch, normalizeDexAppearance, planDexRecord, dexShouldOfferEntry } from "./pokedex.ts";
import type { DexAppearance } from "./pokedex.ts";
import { dexInUnlockedRegion } from "./pokedex-query.ts";
import { own } from "./own.ts";
import { resolveConfig } from "./config.ts";
import type { Content, DexState, Member } from "./types.ts";
export type AcquisitionDexSource = "grant" | "receive" | "party-gift" | "party-silent";
export interface AcquisitionEntryIntent {
  memberId: string; species: string; source: AcquisitionDexSource; previouslyOwned: boolean; offer: boolean; appearance: DexAppearance;
}
export type AcquisitionDexPlan = { status: "ready"; dex: DexState; entries: AcquisitionEntryIntent[] }
  | { status: "refused"; reason: string };
export function planAcquisitionDex(dex: DexState, members: readonly Member[], content: Content,
  options: { source: AcquisitionDexSource; seeForm: boolean; showMessages: boolean }): AcquisitionDexPlan {
  if (typeof options.seeForm !== "boolean" || typeof options.showMessages !== "boolean") return { status: "refused", reason: "invalid-acquisition-dex-options" };
  let next = applyDexPatch(dex, {}); const entries: AcquisitionEntryIntent[] = [];
  for (const member of members) {
    const gender = member.gender === "M" ? 0 : member.gender === "F" ? 1 : member.gender === "N" ? 2 : null;
    if (gender === null || typeof member.shiny !== "boolean") return { status: "refused", reason: "unknown-acquired-appearance" };
    if (!Number.isInteger(member.form) || member.form! < 0 || member.form! > 999
      || (content.forms ? own(own(content.forms, member.species), String(member.form)) === undefined : member.form !== 0)) return { status: "refused", reason: "unknown-acquired-form" };
    const raw: DexAppearance = { species: member.species, form: member.form!, gender, shiny: member.shiny };
    const appearance = normalizeDexAppearance(content, raw), recent = normalizeDexAppearance(content, raw, "recent");
    if (!appearance || !recent) return { status: "refused", reason: "unknown-acquired-form" };
    const plan = planDexRecord(next, { source: options.source, appearance, seeForm: options.seeForm });
    if (plan.status !== "ok") return { status: "refused", reason: plan.reason ?? "invalid-acquisition-dex" };
    entries.push({ memberId: member.id, species: appearance.species, source: options.source, previouslyOwned: plan.previouslyOwned,
      offer: options.showMessages && dexShouldOfferEntry({ source: "grant", previouslyOwned: plan.previouslyOwned, hasDex: next.hasDex,
        inUnlockedDex: !!content.regionalDex && dexInUnlockedRegion(next, content.regionalDex, appearance.species),
        moreOften: resolveConfig(content.settings).SHOW_NEW_SPECIES_POKEDEX_ENTRY_MORE_OFTEN, seeForm: options.seeForm }), appearance: recent });
    next = applyDexPatch(next, plan.patch);
  }
  return { status: "ready", dex: next, entries };
}
