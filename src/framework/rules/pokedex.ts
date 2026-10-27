/** WP62 / approved 5.3 r3 §8. Pure plans over normalized facts; the application owns once-only installation. */
import type { Content, DexFormRecord, DexState, SpeciesData } from "./types";

export interface DexAppearance { species: string; gender: 0 | 1 | 2; form: number; shiny: boolean }
export type DexLastSeen = DexState["lastSeenForm"][string];
export type DexPatch = Partial<Pick<DexState, "seen" | "owned" | "seenForms" | "lastSeenForm" | "capturedCounts" | "defeatedCounts" | "hasDex" | "unlocked" | "view">>;
export interface DexRecordPlan {
  status: "ok" | "invalid";
  patch: DexPatch;
  changed: boolean;
  refreshAccessible: boolean;
  previouslyOwned: boolean;
  reason?: string;
}
export type DexRecordInput =
  | { source: "set-seen" | "set-owned"; species: string | null; shouldRefresh?: boolean }
  | { source: "appearance" | "defeat" | "capture"; species?: string; appearance: DexAppearance | null; internalBattle: boolean; shouldRefresh?: boolean }
  | { source: "grant" | "receive" | "party-gift" | "party-silent"; appearance: DexAppearance | null; seeForm: boolean; shouldRefresh?: boolean }
  | { source: "evolution" | "split" | "trade" | "form-commit"; appearance: DexAppearance | null; shouldRefresh?: boolean };

const own = <T>(record: Record<string, T>, key: string): T | undefined => Object.hasOwn(record, key) ? record[key] : undefined;
const validSpecies = (id: string): boolean => typeof id === "string" && /^[A-Za-z0-9#._:-]{1,64}$/.test(id);
const validRecord = (a: DexLastSeen): boolean => Number.isInteger(a.gender) && a.gender >= 0 && a.gender <= 2 && Number.isInteger(a.form) && a.form >= 0 && a.form <= 999 && typeof a.shiny === "boolean";
const equalRecord = (a: DexLastSeen | undefined, b: DexLastSeen): boolean => a !== undefined && a.gender === b.gender && a.form === b.form && a.shiny === b.shiny;
const copyForms = (dex: DexState): DexState["seenForms"] => Object.fromEntries(Object.entries(dex.seenForms).map(([id, forms]) => [id, forms.map(f => ({ ...f }))]));
const copyLastSeen = (dex: DexState): DexState["lastSeenForm"] => Object.fromEntries(Object.entries(dex.lastSeenForm).map(([id, form]) => [id, { ...form }]));

function dataOf(content: Pick<Content, "species" | "forms">, species: string, form: number): SpeciesData | undefined {
  const forms = content.forms ? own(content.forms, species) : undefined;
  const name = content.forms ? forms && (own(forms, String(form)) ?? own(forms, "0")) : species;
  return name === undefined ? undefined : own(content.species, name);
}

/** Consume the content mapping, never a battle log or an application-private member. Unknown identity stays unknown. */
export function normalizeDexAppearance(content: Pick<Content, "species" | "forms">, individual: DexAppearance, operation: "register" | "recent" = "register"): DexAppearance | null {
  if (!validSpecies(individual.species) || !validRecord(individual)) return null;
  const original = dataOf(content, individual.species, individual.form);
  if (!original) return null;
  const displayForm = original.pokedexForm ?? individual.form;
  const named = operation === "recent" ? original : dataOf(content, individual.species, displayForm);
  if (!named) return null;
  return { species: individual.species, gender: operation === "register" && individual.gender === 2 ? 0 : individual.gender,
    form: named.formName ? displayForm : 0, shiny: individual.shiny };
}

/** A patch's arrays and records are detached from the original state. No event IDs or replay ledger are stored here. */
export function applyDexPatch(dex: DexState, patch: DexPatch): DexState {
  const next = { ...dex, ...patch };
  return { ...next, seen: [...next.seen], owned: [...next.owned],
    seenForms: copyForms(next), lastSeenForm: copyLastSeen(next),
    capturedCounts: { ...next.capturedCounts }, defeatedCounts: { ...next.defeatedCounts }, unlocked: [...next.unlocked],
    view: { ...next.view, indices: [...next.view.indices] } };
}

/** Registration sources deliberately do not share a universal owned => seen rule. Counts count calls, not set changes. */
export function planDexRecord(dex: DexState, input: DexRecordInput): DexRecordPlan {
  const appearance = "appearance" in input ? input.appearance : null;
  const species = input.source === "set-seen" || input.source === "set-owned" ? input.species : ("species" in input ? input.species : undefined) ?? appearance?.species ?? null;
  const previouslyOwned = species !== null && dex.owned.includes(species);
  const result: DexRecordPlan = { status: "ok", patch: {}, changed: false, refreshAccessible: false, previouslyOwned };
  // The three battle wrappers have the internal-battle gate. Capture's direct owned write does not.
  if ((input.source === "appearance" || input.source === "defeat") && !input.internalBattle) return result;
  const register = input.source === "appearance" || input.source === "form-commit" || input.source === "evolution" || input.source === "split" || input.source === "trade"
    || ((input.source === "grant" || input.source === "receive" || input.source === "party-gift" || input.source === "party-silent") && input.seeForm)
    || (input.source === "capture" && input.internalBattle);
  if (species === null || !validSpecies(species) || (appearance !== null && !validRecord(appearance))) {
    if (register) return { ...result, status: "invalid", reason: "registration requires a known normalized species and appearance" };
    return result; // Guard-family unknown identities are no-ops.
  }
  if (appearance && appearance.species !== species) return { ...result, status: "invalid", reason: "appearance and base species disagree" };
  const seen = register || input.source === "set-seen" || input.source === "grant" || input.source === "receive" || input.source === "party-gift";
  const owned = input.source === "set-owned" || input.source === "capture" || input.source === "grant" || input.source === "receive" || input.source === "party-gift" || input.source === "party-silent" || input.source === "evolution" || input.source === "split" || input.source === "trade";
  if (seen && !dex.seen.includes(species)) result.patch.seen = [...dex.seen, species];
  if (owned && !previouslyOwned) result.patch.owned = [...dex.owned, species];
  if (register && appearance) {
    const record: DexFormRecord = { gender: appearance.gender === 2 ? 0 : appearance.gender, form: appearance.form, shiny: appearance.shiny };
    const old = own(dex.seenForms, species) ?? [];
    if (!old.some(f => equalRecord(f, record))) result.patch.seenForms = { ...copyForms(dex), [species]: [...old.map(f => ({ ...f })), record] };
    if (!own(dex.lastSeenForm, species)) result.patch.lastSeenForm = { ...copyLastSeen(dex), [species]: { ...record } };
  }
  const countKey = input.source === "defeat" ? "defeatedCounts" : input.source === "capture" && input.internalBattle ? "capturedCounts" : null;
  if (countKey) {
    const count = own(dex[countKey], species) ?? 0;
    if (!Number.isSafeInteger(count) || count < 0 || count === Number.MAX_SAFE_INTEGER) return { ...result, status: "invalid", patch: {}, changed: false, reason: "dex count would exceed the nonnegative safe-integer domain" };
    result.patch[countKey] = { ...dex[countKey], [species]: count + 1 };
  }
  result.changed = Object.keys(result.patch).length > 0;
  result.refreshAccessible = (seen || owned && (input.source !== "capture" || !previouslyOwned)) && input.shouldRefresh !== false;
  return result;
}

/** Raw-key operation: recent individual normalization is separate; callers can also retain legacy raw form keys. */
export function planDexLastSeen(dex: DexState, species: string, record: DexLastSeen): DexRecordPlan {
  const previouslyOwned = dex.owned.includes(species);
  if (!validSpecies(species) || !validRecord(record)) return { status: "invalid", patch: {}, changed: false, refreshAccessible: false, previouslyOwned, reason: "invalid last-seen key or record" };
  const changed = !equalRecord(own(dex.lastSeenForm, species), record);
  return { status: "ok", patch: changed ? { lastSeenForm: { ...copyLastSeen(dex), [species]: { gender: record.gender, form: record.form, shiny: record.shiny } } } : {}, changed, refreshAccessible: false, previouslyOwned };
}

export function dexLastSeen(dex: DexState, species: string): DexLastSeen {
  return { ...(own(dex.lastSeenForm, species) ?? { gender: 0, form: 0, shiny: false }) };
}

/** Read-only even when there is no form history. Absence is never backfilled from current members. */
export function dexSeenForm(dex: DexState, species: string, gender: 0 | 1, form: number, shiny?: boolean): boolean {
  return (own(dex.seenForms, species) ?? []).some(f => f.gender === gender && f.form === form && (shiny === undefined || f.shiny === shiny));
}

/** D53-02a compatibility: count distinct forms 0/1 only, retaining precise records for all other forms. */
export function dexSeenFormCount(dex: DexState, species: string): number {
  return [0, 1].filter(form => (own(dex.seenForms, species) ?? []).some(f => f.form === form)).length;
}

export function dexBattleCount(dex: DexState, species: string): number {
  return (own(dex.capturedCounts, species) ?? 0) + (own(dex.defeatedCounts, species) ?? 0);
}

/** Author/debug clear keeps eligibility, layout and viewing state. Its caller refreshes the ephemeral access cache. */
export function planDexClear(): DexPatch {
  return { seen: [], owned: [], seenForms: {}, lastSeenForm: {}, capturedCounts: {}, defeatedCounts: {} };
}

/** Eligibility is computed from the pre-operation owned fact, so installing owned does not erase a first-entry prompt. */
export function dexShouldOfferEntry(options: { source: "capture" | "grant" | "evolution" | "trade"; previouslyOwned: boolean; hasDex: boolean; inUnlockedDex: boolean; moreOften: boolean; seeForm?: boolean }): boolean {
  return !options.previouslyOwned && options.hasDex && options.inUnlockedDex
    && (options.source === "capture" || options.moreOften && (options.source !== "grant" || options.seeForm === true));
}
