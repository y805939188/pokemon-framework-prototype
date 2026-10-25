/** Pure individual identity and WP18/19 metadata. No host clock, RNG or species loading. */
import { sha256Hex } from "./sha256.ts";
import { clonePersistentMember } from "./member-metadata.ts";
import type { GenderRule, Member, MemberOrigin, Owner, PartialStats, SpeciesData, StatKey } from "./types.ts";

export const COMPATIBLE_PLAYER: Readonly<Owner> = Object.freeze({ id: 0, name: "player", gender: 2, language: 2 });
export const NATURE_ORDER: readonly string[] = [
  "hardy", "lonely", "brave", "adamant", "naughty", "bold", "docile", "relaxed", "impish", "lax", "timid", "hasty", "serious",
  "jolly", "naive", "modest", "mild", "quiet", "bashful", "rash", "calm", "gentle", "sassy", "careful", "quirky",
];

export function uint32(n: number): number {
  if (!Number.isInteger(n) || n < 0 || n > 0xffffffff) throw new RangeError("expected a uint32");
  return n;
}

export const publicId = (id: number): number => uint32(id) & 0xffff;
export const secretId = (id: number): number => uint32(id) >>> 16;
export const publicIdText = (id: number): string => String(publicId(id)).padStart(5, "0");
export const isForeign = (owner: Owner, player: Owner): boolean => owner.id !== player.id || owner.name !== player.name;
export function ownerLanguage(locale: string): number {
  const code = locale.toLowerCase().split(/[-_]/)[0];
  return ({ ja: 1, en: 2, fr: 3, it: 4, de: 5, es: 7, ko: 8 } as Record<string, number>)[code ?? ""] ?? 2;
}

export function shinyFromPersonalId(pid: number, ownerId: number): { shiny: boolean; superShiny: boolean } {
  const xor = (uint32(pid) ^ uint32(ownerId)) >>> 0;
  const folded = (xor & 0xffff) ^ (xor >>> 16);
  return { shiny: folded < 16, superShiny: folded === 0 };
}

/** Requested and effective slots differ for a missing hidden candidate; sparse arrays keep their indices. */
export function resolveAbility(pid: number, species: Pick<SpeciesData, "abilities" | "hiddenAbilities">, requested = pid & 1): { ability: string; abilityIndex: number; effectiveAbilityIndex: number | null } {
  uint32(pid);
  if (!Number.isSafeInteger(requested) || requested < 0) throw new RangeError("ability slot must be a nonnegative safe integer");
  const natural = species.abilities ?? [];
  const hidden = requested >= 2 ? species.hiddenAbilities?.[requested - 2] : null;
  if (hidden) return { ability: hidden, abilityIndex: requested, effectiveAbilityIndex: requested };
  const chosen = requested >= 2 ? pid & 1 : requested;
  const effective = natural[chosen] ? chosen : natural[0] ? 0 : null;
  return { ability: effective === null ? "" : natural[effective]!, abilityIndex: requested, effectiveAbilityIndex: effective };
}

export function deriveIndividual(pid: number, species: { gender: GenderRule; abilities?: (string | null)[]; hiddenAbilities?: (string | null)[] }, abilityIndex?: number): { nature: string; gender: string; ability: string; abilityIndex: number; effectiveAbilityIndex: number | null } {
  uint32(pid);
  const gender = typeof species.gender === "number" ? ((pid & 0xff) < species.gender ? "F" : "M") : species.gender;
  return { nature: NATURE_ORDER[pid % 25]!, gender, ...resolveAbility(pid, species, abilityIndex) };
}

/** Stable across key order, location, time and repeated migrations. This is not an entity key. */
export function legacyPersonalId(raw: unknown): number {
  const canonical = (v: unknown): unknown => Array.isArray(v) ? v.map(canonical) : v !== null && typeof v === "object"
    ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical((v as Record<string, unknown>)[k])])) : v;
  return Number.parseInt(sha256Hex(`legacy-personal-id-v1\n${JSON.stringify(canonical(raw))}`).slice(0, 8), 16);
}

export const unknownOrigin = (level: number): MemberOrigin => ({ method: null, map: null, text: "", level, receivedAt: null, hatchedMap: 0, hatchedAt: null, compatibilityDefault: true });

/** Only absent fields are filled. Trusted old nature/gender/ability/shiny values never get rerolled. */
export function completeIndividual(member: Member, species: Pick<SpeciesData, "gender" | "abilities" | "hiddenAbilities">, legacy: unknown = member): Member {
  const pid = member.personalID === undefined ? legacyPersonalId(legacy) : uint32(member.personalID);
  const inferred = deriveIndividual(pid, { ...species, gender: species.gender ?? "N" });
  const candidates = [
    ...(species.abilities ?? []).map((ability, index) => ({ ability, index })),
    ...(species.hiddenAbilities ?? []).map((ability, index) => ({ ability, index: index + 2 })),
  ].filter((c) => c.ability && c.ability === member.ability);
  const slot = member.abilityIndex !== undefined ? member.abilityIndex : member.ability === undefined ? inferred.abilityIndex : candidates.length === 1 ? candidates[0]!.index : null;
  const effective = slot === null ? null : resolveAbility(pid, species, slot).effectiveAbilityIndex;
  const out: Member = {
    ...clonePersistentMember(member), personalID: pid,
    nature: member.nature ?? inferred.nature, gender: member.gender ?? inferred.gender, ability: member.ability ?? inferred.ability,
    abilityIndex: slot, effectiveAbilityIndex: member.effectiveAbilityIndex === undefined ? effective : member.effectiveAbilityIndex,
    owner: member.owner ? { ...member.owner } : { ...COMPATIBLE_PLAYER, name: member.ot ?? "player" },
    ownerCompatibilityDefault: member.ownerCompatibilityDefault ?? !member.owner,
    origin: member.origin ? { ...member.origin } : unknownOrigin(member.level),
    shiny: member.shiny ?? false, superShiny: member.superShiny ?? false,
    firstMoves: member.firstMoves ? [...member.firstMoves] : member.moves.map((m) => m.id),
    markings: [...(member.markings ?? [])], ribbons: [...(member.ribbons ?? [])],
    cannotStore: member.cannotStore ?? false, cannotRelease: member.cannotRelease ?? false, cannotTrade: member.cannotTrade ?? false,
    isEgg: member.isEgg ?? false, mail: member.mail ?? null, readyToEvolve: member.readyToEvolve ?? false,
    evolutionReadiness: member.evolutionReadiness ?? "known",
  };
  delete out.ot;
  return out;
}

/** WP19 characteristic: tie order is HP, Atk, Def, Speed, SpAtk, SpDef, rotated from PID % 6. */
export function characteristic(pid: number, ivs: PartialStats): { stat: StatKey; variant: number } {
  uint32(pid);
  const order: StatKey[] = ["hp", "atk", "def", "spe", "spa", "spd"];
  const max = Math.max(...order.map((s) => ivs[s] ?? 0));
  for (let offset = 0; offset < 6; offset++) {
    const stat = order[(pid % 6 + offset) % 6]!;
    if ((ivs[stat] ?? 0) === max) return { stat, variant: max % 5 };
  }
  throw new Error("unreachable characteristic");
}

export function initialOrdinal(ids: readonly string[]): string {
  let max = 0n;
  for (const id of ids) for (const digits of id.match(/\d+/g) ?? []) { const n = BigInt(digits); if (n > max) max = n; }
  return String(max + 1n);
}

export function allocateMemberId(nextOrdinal: string, taken: ReadonlySet<string>): { id: string; nextMemberOrdinal: string } {
  if (!/^[1-9]\d*$/.test(nextOrdinal)) throw new Error("nextMemberOrdinal must be a positive canonical decimal integer");
  let ordinal = BigInt(nextOrdinal);
  for (;;) {
    const id = `M${ordinal.toString(36)}`;
    if (id.length > 18) throw new Error("member id namespace exhausted; no member was added");
    ordinal++;
    if (!taken.has(id)) return { id, nextMemberOrdinal: String(ordinal) };
  }
}

/** Receiving an externally prepared M-id also advances the same allocator; releasing it cannot make it reusable. */
export function advanceMemberOrdinal(current: string, ids: readonly string[], proposed = current): string {
  if (!/^[1-9]\d*$/.test(current) || !/^[1-9]\d*$/.test(proposed)) throw new Error("nextMemberOrdinal must be a positive canonical decimal integer");
  let next = BigInt(proposed);
  if (next < BigInt(current)) throw new Error("nextMemberOrdinal cannot move backwards");
  for (const id of ids) {
    const match = /^M([0-9a-z]+)$/.exec(id);
    if (!match) continue;
    let ordinal = 0n;
    for (const digit of match[1]!) ordinal = ordinal * 36n + BigInt(Number.parseInt(digit, 36));
    if (ordinal >= next) next = ordinal + 1n;
  }
  return String(next);
}
