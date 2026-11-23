/** WP18/19/21 creation caches and WP36 ordinary-shiny retries.
 * A transient creation stage, not a complete R06 generator or a save schema.
 * Held items, lead bias, dynamic form freezing and wild-created hooks belong to later stages.
 */
import { initializeMemberCreation, materializeMemberCreation, personalId, initialMoves } from "./member-factory";
import type { CreateMemberInput, MemberCreationSeed, Random } from "./member-factory";
import { resolveAbility, shinyFromPersonalId, uint32 } from "./member-identity";
import { own } from "./own";
import type { Content, Member, MoveSlot, SpeciesData, Stats } from "./types";
import { initialWildDynamicForm, hasInitialWildFormReader } from "./wild-form";
import type { WildFormEnvironment } from "./wild-form";
import { initialWildBattleNameOf } from "./species-key";

export type CreateWildMemberInput = Omit<CreateMemberInput, "nature" | "gender" | "ability" | "abilityIndex" | "shiny" | "superShiny" | "trainerForm" | "context"> & {
  context?: CreateMemberInput["context"] & WildFormEnvironment;
};

/** Presence of both real host objects, supplied by the operation that owns them. Owner is not this fact. */
export interface WildCreationRegistration {
  readonly playerPresent: boolean;
  readonly dexPresent: boolean;
}
export interface WildFormRegistration {
  readonly species: string; readonly form: number; readonly gender: 0 | 1 | 2; readonly shiny: boolean;
}

export interface WildMemberCacheTrace {
  readonly personalID: number;
  readonly nature: string;
  readonly form: number;
  readonly species: string;
  readonly ivs: Readonly<Stats>;
  readonly creationFormHandlerRan: boolean;
  readonly registrationRead: boolean;
  readonly caches: Readonly<{
    gender: "M" | "F" | "N" | null;
    abilityIndex: number | null;
    ability: string | null;
    effectiveAbilityIndex: number | null;
    shiny: boolean | null;
    superShiny: boolean | null;
  }>;
}

/** WP21 B: eleven registrations plus five copied identities. Returning zero is still a commit. */
function hasCreationFormHandler(species: string): boolean {
  return ["UNOWN", "BURMY", "WORMADAM", "SCATTERBUG", "SPEWPA", "VIVILLON", "PUMPKABOO", "GOURGEIST", "LYCANROC", "MINIOR", "TOXEL", "TOXTRICITY", "SINISTEA", "POLTEAGEIST", "ALCREMIE", "URSHIFU"]
    .includes(species.replace(/[^a-z0-9]/gi, "").toUpperCase());
}

class WildDraft {
  #seed: MemberCreationSeed;
  #gender: "M" | "F" | "N" | null = null;
  #abilityIndex: number | null = null;
  #ability: string | null = null;
  #effectiveAbilityIndex: number | null = null;
  #shiny: boolean | null = null;
  #superShiny: boolean | null = null;
  #handlerRan: boolean;
  #registrationRead: boolean;
  #creationSpecies: SpeciesData;
  #moves: MoveSlot[] | null = null;
  #registrations: WildFormRegistration[] = [];

  constructor(seed: MemberCreationSeed, handlerRan: boolean, registrationRead: boolean) {
    this.#seed = seed;
    this.#creationSpecies = seed.species;
    this.#handlerRan = handlerRan;
    this.#registrationRead = registrationRead;
    if (registrationRead) {
      this.#registerForm();
    }
  }
  #registerForm(): void {
    const gender = this.readGender();
    this.#registrations.push({ species: this.#seed.species.contentId ?? this.#seed.input.species,
      form: this.#seed.form, gender: gender === "M" ? 0 : gender === "F" ? 1 : 2, shiny: this.readShiny() });
  }
  registrationIntents(): WildFormRegistration[] { return this.#registrations.map(value => ({ ...value })); }

  speciesData(): Readonly<SpeciesData> { return this.#seed.species; }
  creationMoves(): MoveSlot[] {
    this.#moves ??= this.#seed.input.withMoves === false ? [] : initialMoves(this.#creationSpecies, this.#seed.input.level, this.#seed.content);
    return this.#moves.map(move => ({ ...move }));
  }
  applyLeadOverrides(gender: "M" | "F" | null, nature: string | null): void {
    if (gender !== null) this.#gender = gender;
    if (nature !== null) this.#seed.nature = nature;
  }
  /** WP18 dynamic read commits only a changed value; the following simple freeze adds no second commit. */
  freezeInitialForm(item: string, context: WildFormEnvironment, registration: WildCreationRegistration): void {
    const family = this.#seed.species.ruleSpecies ?? this.#seed.speciesName;
    if (!hasInitialWildFormReader(family)) return;
    const form = initialWildDynamicForm(family, {
      form: this.#seed.form, item, personalID: this.#seed.personalID,
      readAbility: () => this.readAbility(), readGender: () => this.readGender(),
      moves: () => this.creationMoves().map(move => move.id),
    }, context);
    if (form !== null && form !== this.#seed.form) {
      // Resolve before mutating the detached draft. Existing creation checks remain exact.
      const name = initialWildBattleNameOf(this.#seed.content, { species: this.#seed.species.contentId ?? this.#seed.input.species, form });
      const species = name ? own(this.#seed.content.species, name) : undefined;
      if (!name || !species) throw Error("missing initial wild dynamic form");
      // Keep creation moves even when A switches to a record with a different learnset.
      this.creationMoves();
      this.#seed.form = form; this.#seed.speciesName = name; this.#seed.species = species;
      this.#ability = null; this.#effectiveAbilityIndex = null;
      // The only A+commit handlers are FURFROU/HOOPA: fresh time_form_set is already null at form zero.
      if (registration.playerPresent && registration.dexPresent) {
        this.#registrationRead = true; this.#registerForm();
      }
    }
    // Simple freeze uses the stored result. Stats are computed by materialization, without extra hooks/cache clearing.
  }

  /** A detached observation: inspecting cache state never evaluates an uncached property. */
  trace(): WildMemberCacheTrace {
    return {
      personalID: this.#seed.personalID, nature: this.#seed.nature, form: this.#seed.form, species: this.#seed.speciesName,
      ivs: { ...this.#seed.ivs }, creationFormHandlerRan: this.#handlerRan, registrationRead: this.#registrationRead,
      caches: { gender: this.#gender, abilityIndex: this.#abilityIndex, ability: this.#ability, effectiveAbilityIndex: this.#effectiveAbilityIndex, shiny: this.#shiny, superShiny: this.#superShiny },
    };
  }

  readGender(): "M" | "F" | "N" {
    const rule = this.#seed.species.gender;
    if (typeof rule !== "number") return rule ?? "N";
    if (this.#gender === null) this.#gender = (this.#seed.personalID & 0xff) < rule ? "F" : "M";
    return this.#gender;
  }

  readAbilityIndex(): number {
    if (this.#abilityIndex === null) this.#abilityIndex = this.#seed.personalID & 1;
    return this.#abilityIndex;
  }

  readAbility(): string {
    if (this.#ability === null) {
      const resolved = resolveAbility(this.#seed.personalID, this.#seed.species, this.readAbilityIndex());
      this.#ability = resolved.ability;
      this.#effectiveAbilityIndex = resolved.effectiveAbilityIndex;
    }
    return this.#ability;
  }

  readShiny(): boolean {
    if (this.#shiny === null) this.#shiny = shinyFromPersonalId(this.#seed.personalID, this.#seed.owner.id).shiny;
    return this.#shiny;
  }

  readSuperShiny(): boolean {
    if (this.#superShiny === null) this.#superShiny = shinyFromPersonalId(this.#seed.personalID, this.#seed.owner.id).superShiny;
    return this.#superShiny;
  }

  setShiny(value: boolean | null): void {
    if (value !== null && typeof value !== "boolean") throw new TypeError("shiny cache must be boolean or null");
    this.#shiny = value;
  }

  setSuperShiny(value: boolean | null): void {
    if (value !== null && typeof value !== "boolean") throw new TypeError("super-shiny cache must be boolean or null");
    this.#superShiny = value;
    if (value === true) this.#shiny = true;
  }

  /** A PID write alone never clears unrelated caches. Only the retry stage below clears ordinary shiny. */
  #setPersonalId(value: number): void {
    this.#seed.personalID = uint32(value);
  }

  rerollShiny(retries: number, random: Random): void {
    if (!Number.isSafeInteger(retries) || retries < 0) throw new RangeError("shiny retries must be a nonnegative safe integer");
    for (let attempt = 0; attempt < retries; attempt++) {
      if (this.readShiny()) break;
      this.#shiny = null;
      this.#setPersonalId(personalId(random));
    }
  }

  /** Resolve only at this consumer, with no extra random draws or creation-handler rerun. */
  materialize(): Member {
    const gender = this.readGender(), abilityIndex = this.readAbilityIndex(), ability = this.readAbility();
    return materializeMemberCreation(this.#seed, {
      gender, abilityIndex, ability, effectiveAbilityIndex: this.#effectiveAbilityIndex,
      shiny: this.readShiny(), superShiny: this.readSuperShiny(),
    }, this.creationMoves());
  }
}

export type WildMemberDraft = WildDraft;

export function createWildMemberDraft(input: CreateWildMemberInput, content: Content, random: Random, registration: WildCreationRegistration): WildMemberDraft {
  if (!registration || typeof registration.playerPresent !== "boolean" || typeof registration.dexPresent !== "boolean") throw new TypeError("wild creation requires player/dex presence facts");
  // Wild creation starts from ordinary defaults. Old eager overrides remain exclusive to createMember.
  const ordinary: CreateMemberInput = {
    id: input.id, species: input.species, level: input.level, ball: input.ball, ot: input.ot,
    owner: input.owner ? { ...input.owner } : undefined, form: input.form, withMoves: input.withMoves,
    recheckForm: input.recheckForm, context: input.context ? { ...input.context } : undefined,
  };
  const initialSpecies = own(content.species, input.species);
  const handlerRan = input.form === undefined && input.recheckForm !== false && (initialSpecies?.form ?? 0) === 0
    && hasCreationFormHandler(initialSpecies?.ruleSpecies ?? input.species);
  const seed = initializeMemberCreation(ordinary, content, random);
  return new WildDraft(seed, handlerRan, handlerRan && registration.playerPresent && registration.dexPresent);
}

/** WP36 tier draw precedes retries even if a later first shiny read will stop immediately. */
export function wildShinyRetries(facts: { readonly shinyCharm: boolean; readonly higherShinyByBattled: boolean; readonly battledCount: number }, random: Random): number {
  if (typeof facts.shinyCharm !== "boolean" || typeof facts.higherShinyByBattled !== "boolean" || !Number.isSafeInteger(facts.battledCount) || facts.battledCount < 0) throw new TypeError("invalid wild shiny facts");
  let retries = facts.shinyCharm ? 2 : 0;
  if (!facts.higherShinyByBattled || facts.battledCount < 50) return retries;
  const count = facts.battledCount;
  const [chance, added] = count < 100 ? [15, 1] : count < 200 ? [20, 2] : count < 300 ? [25, 3] : count < 500 ? [30, 4] : [30, 5];
  const roll = random(1000);
  if (!Number.isInteger(roll) || roll < 0 || roll >= 1000) throw new RangeError(`random(1000) returned ${String(roll)}`);
  return retries + (roll < chance! ? added! : 0);
}
