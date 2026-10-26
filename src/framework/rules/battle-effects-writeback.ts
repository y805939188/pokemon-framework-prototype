/** Finite auxiliary composition over an already validated primary plan. The application owns installation and replay. */
import { planBattleReadiness } from "./battle-consumption.ts";
import type { ResolvedBattleEffects } from "./battle-consumption.ts";
import type { EvolutionCheckResult } from "./evolution.ts";
import { own } from "./own.ts";
import { applyDexPatch, normalizeDexAppearance, planDexRecord } from "./pokedex.ts";
import type { DexAppearance, DexRecordInput } from "./pokedex.ts";
import { speciesKeyResolver } from "./species-key.ts";
import { locateMember } from "./storage.ts";
import type { BattleResult, GameState } from "./state.ts";
import type { Content } from "./types.ts";
import { clone } from "./value.ts";

export interface BattleEffectsWritebackDisposition {
  group: "friendship" | "readiness" | "appearance" | "defeat" | "capture-owned" | "capture-appearance" | "capture-count";
  status: "applied" | "skipped" | "invalid";
  memberId: string;
  reason?: string;
}
export interface BattleEffectsCaptureIntent { memberId: string; species: string; previouslyOwned: boolean }
export interface ComposeBattleEffectsInput {
  before: GameState;
  /** Complete legal main result, reception, money and original ledger, with no raw.dex additions. D3 is composed by its owner. */
  primary: GameState;
  raw: BattleResult;
  content: Content;
  effects: ResolvedBattleEffects;
  internalBattle: boolean;
  /** Only the owner's complete ordered evolution scans. Omission waits for that real scan and never earns new readiness. */
  readinessScans?: Readonly<Record<string, EvolutionCheckResult>>;
}
export interface ComposedBattleEffects {
  state: GameState;
  dispositions: BattleEffectsWritebackDisposition[];
  captures: BattleEffectsCaptureIntent[];
}
const speciesId = (value: string): boolean => typeof value === "string" && /^[A-Za-z0-9#._:-]{1,64}$/.test(value);
const formNumber = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 999;
const friendshipValue = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 255;

/** Only friendship, the readiness pair and finite dex fields may differ from primary. Inputs stay detached. */
export function composeBattleEffects(input: ComposeBattleEffectsInput): ComposedBattleEffects {
  const { before, primary, raw, content, effects, internalBattle } = input;
  const state = clone(primary), dispositions: BattleEffectsWritebackDisposition[] = [], captures: BattleEffectsCaptureIntent[] = [];
  // Start from history, never a legacy whole-enemy raw.dex projection (even if supplied on primary by mistake).
  state.dex = applyDexPatch(before.dex, {});
  const note = (group: BattleEffectsWritebackDisposition["group"], memberId: string, status: BattleEffectsWritebackDisposition["status"], reason?: string): void => {
    dispositions.push({ group, memberId, status, ...(reason === undefined ? {} : { reason }) });
  };
  for (const id of Object.keys(effects.friendshipReplacements)) {
    const member = locateMember(state, id)?.member, replacement = own(effects.friendshipReplacements, id);
    if (!member || !locateMember(before, id)) { note("friendship", id, "invalid", "original-member-not-found"); continue; }
    const primaryFriendship = own(raw.members, id);
    if (primaryFriendship && Object.hasOwn(primaryFriendship, "friendship") && friendshipValue(primaryFriendship.friendship)) {
      note("friendship", id, "skipped", "legal-primary-friendship-wins"); continue;
    }
    if (!friendshipValue(replacement)) { note("friendship", id, "invalid", "friendship-out-of-range"); continue; }
    member.friendship = replacement;
    note("friendship", id, "applied");
  }
  // A raw HP0 remains certain after reception's preserve-readiness deposit heal has restored physical HP.
  for (const id of new Set([...Object.keys(effects.faint), ...Object.keys(raw.members)])) {
    const member = locateMember(state, id)?.member, previous = locateMember(before, id)?.member;
    if (!member || !previous) { note("readiness", id, "invalid", "original-member-not-found"); continue; }
    const faint = own(effects.faint, id) ?? { positiveOccurrences: [], coverage: { status: "unavailable" as const, reason: "faint-not-supplied" } };
    const scan = own(input.readinessScans, id);
    const scanComplete = scan?.kind === "target" || scan?.kind === "no-target";
    const permitsNewReady = state.party.some(value => value.id === id) && scanComplete && scan.readiness?.readyToEvolve === true && scan.readiness.evolutionReadiness === "known";
    const hp = own(raw.members, id)?.hp === 0 ? 0 : member.hp;
    const ready = planBattleReadiness({
      member: { id, hp, readyToEvolve: previous.readyToEvolve, evolutionReadiness: previous.evolutionReadiness },
      faint, damage: own(effects.damage, id),
      ...(scan === undefined ? {} : { scan: { status: scanComplete ? "complete" : "invalid", permitsNewReady } }),
    });
    member.readyToEvolve = ready.readyToEvolve;
    member.evolutionReadiness = ready.evolutionReadiness;
    const changed = ready.readyToEvolve !== previous.readyToEvolve || ready.evolutionReadiness !== previous.evolutionReadiness;
    const why = hp === 0 ? "reliable-hp-zero" : !ready.readyToEvolve && faint.positiveOccurrences.length ? "known-faint"
      : ready.evolutionReadiness === "unknown" ? "faint-coverage-or-prior-readiness-unknown"
      : scan === undefined ? "awaiting-complete-ordered-evolution-scan" : !scanComplete ? "evolution-scan-unavailable-or-invalid" : undefined;
    note("readiness", id, changed ? "applied" : "skipped", why);
  }
  const record = (group: BattleEffectsWritebackDisposition["group"], id: string, operation: DexRecordInput, countKey?: "capturedCounts" | "defeatedCounts", reason?: string): void => {
    const plan = planDexRecord(state.dex, operation);
    if (plan.status === "invalid") { note(group, id, "invalid", plan.reason); return; }
    // Counters are isolated from independently installed ownership/display writes, including on overflow.
    const patch = countKey ? (plan.patch[countKey] === undefined ? {} : { [countKey]: plan.patch[countKey] }) : plan.patch;
    state.dex = applyDexPatch(state.dex, patch);
    note(group, id, Object.keys(patch).length ? "applied" : "skipped", "internalBattle" in operation && !operation.internalBattle ? "not-internal-battle" : reason);
  };
  const resolveKey = speciesKeyResolver(content);
  const display = (battleSpecies: string, gender: 0 | 1 | 2, shiny: boolean): { species: string; appearance: DexAppearance | null } | null => {
    const key = resolveKey(battleSpecies);
    // A failed mapping never borrows the captured template, another member or a guessed form0.
    if (!key || !speciesId(key.species)) return null;
    return { species: key.species, appearance: formNumber(key.form) ? normalizeDexAppearance(content, { ...key, gender, shiny }) : null };
  };
  for (const appearance of effects.appearances) {
    const normalized = display(appearance.display.battleSpecies, appearance.display.gender, appearance.display.shiny);
    if (!normalized) { note("appearance", appearance.memberId, "invalid", "display-species-or-form-unmapped"); continue; }
    record("appearance", appearance.memberId, { source: "appearance", ...normalized, internalBattle }, undefined, normalized.appearance ? undefined : "display-form-unavailable");
  }
  for (const defeat of effects.defeats) {
    const normalized = display(defeat.display.battleSpecies, defeat.display.gender, defeat.display.shiny);
    if (!normalized) { note("defeat", defeat.memberId, "invalid", "display-species-or-form-unmapped"); continue; }
    // Each resolved actual faint occurrence counts once, including repeat faint after revival. No second event ledger.
    record("appearance", defeat.memberId, { source: "appearance", ...normalized, internalBattle }, undefined, normalized.appearance ? undefined : "display-form-unavailable");
    record("defeat", defeat.memberId, { source: "defeat", ...normalized, internalBattle }, "defeatedCounts", normalized.appearance ? undefined : "display-form-unavailable");
  }
  for (const captured of raw.captured) {
    const member = locateMember(state, captured.id)?.member;
    if (!member || locateMember(before, captured.id) || !speciesId(member.species)) { note("capture-owned", captured.id, "invalid", "accepted-capture-not-found"); continue; }
    captures.push({ memberId: member.id, species: member.species, previouslyOwned: before.dex.owned.includes(member.species) });
    // Legal reception independently proves owned, even if observer data, appearance or the counter is unavailable.
    record("capture-owned", member.id, { source: "set-owned", species: member.species });
    const gender = member.gender === "M" ? 0 : member.gender === "F" ? 1 : member.gender === "N" ? 2 : null;
    const normalized = gender !== null && formNumber(member.form) && typeof member.shiny === "boolean"
      ? normalizeDexAppearance(content, { species: member.species, form: member.form, gender, shiny: member.shiny }) : null;
    record("capture-appearance", member.id, { source: "appearance", species: member.species, appearance: normalized, internalBattle }, undefined, normalized ? undefined : "capture-form-unavailable");
    record("capture-count", member.id, { source: "capture", species: member.species, appearance: null, internalBattle }, "capturedCounts");
  }
  return { state, dispositions, captures };
}
