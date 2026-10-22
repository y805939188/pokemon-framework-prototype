/**
 * The two identities of a species and the conversions between them (decision D5-3, step 5.0).
 *   persistent  content id + form number (WP03 §3.2 "(species, form)"): what the save stores (schema 4), the dex, grants
 *   battle      the Showdown species name: what sessions, the engine and protocol v1 (frozen) use
 * The content layer owns the mapping (`Content.forms` and its reverse `Content.speciesKeys`, built by the runtime
 * assembly). Fixture content has no mapping table: its content ids ARE the Showdown names (form 0). Pure.
 */
import { own } from "./own.ts";
import type { Content, Member, SpeciesData, SpeciesKey } from "./types.ts";

/** Highest form number a record or a save may carry (the editors' range, WP73-A: 0-999). */
export const MAX_FORM = 999;

type KeyTables = Pick<Content, "species" | "forms" | "speciesKeys">;

/** Battle name -> persistent key, or null when the content does not provide that species. */
export function keyOfBattleName(content: KeyTables, name: string): SpeciesKey | null {
  if (content.speciesKeys) {
    const k = own(content.speciesKeys, name);
    return k ? { species: k.species, form: k.form } : null;
  }
  return own(content.species, name) ? { species: name, form: 0 } : null;
}

/**
 * Persistent key -> battle name, or null for an unknown content id. A form the content does not define falls back to
 * the base form, like the reference's form lookup (WP03 §3.2 Species: "形态缺失回退基础物种").
 */
export function battleNameOf(content: KeyTables, key: SpeciesKey): string | null {
  if (content.forms) {
    const forms = own(content.forms, key.species);
    if (!forms) return null;
    return own(forms, String(key.form)) ?? own(forms, "0") ?? null;
  }
  return own(content.species, key.species) ? key.species : null;
}

/** Every battle name of a content id (all its forms); the dex is kept per species, the engine asks per form. */
export function battleNamesOfSpecies(content: KeyTables, id: string): string[] {
  if (content.forms) {
    const forms = own(content.forms, id);
    return forms ? Object.keys(forms).sort((a, b) => Number(a) - Number(b)).map((f) => forms[f]!) : [];
  }
  return own(content.species, id) ? [id] : [];
}

export const memberKey = (m: Pick<Member, "species" | "form">): SpeciesKey => ({ species: m.species, form: m.form ?? 0 });

/** Species data of a PERSISTENT member, or null when its content id is unknown. */
export function speciesDataOf(content: KeyTables, m: Pick<Member, "species" | "form">): SpeciesData | null {
  const name = battleNameOf(content, memberKey(m));
  return name === null ? null : own(content.species, name) ?? null;
}

const where = (content: Pick<Content, "meta">): string => (content.meta ? ` "${content.meta.id}"` : "");

/** A persistent member as the battle layer sees it: Showdown name and no form. Throws for an unknown content id. */
export function toBattleMember(m: Member, content: Pick<Content, "species" | "forms" | "speciesKeys" | "meta">): Member {
  const name = battleNameOf(content, memberKey(m));
  if (name === null) throw new Error(`member ${m.id}: species "${m.species}" (form ${m.form ?? 0}) is not in the content${where(content)}`);
  const out: Member = { ...m, species: name };
  delete out.form;
  return out;
}

/** A battle member (Showdown name) as a persistent member (content id + form). Throws when the content has no key for it. */
export function toPersistentMember(m: Member, content: Pick<Content, "species" | "forms" | "speciesKeys" | "meta">): Member {
  const k = keyOfBattleName(content, m.species);
  if (!k) throw new Error(`member ${m.id}: "${m.species}" has no persistent species key in the content${where(content)}`);
  return { ...m, species: k.species, form: k.form };
}

/** Battle name -> persistent key; what the save migration and the result write-back are given. */
export type SpeciesKeyResolver = (battleName: string) => SpeciesKey | null;

export const speciesKeyResolver = (content: KeyTables): SpeciesKeyResolver => (name) => keyOfBattleName(content, name);

/** For fixture worlds only (content ids = battle names). The game application always resolves through the content. */
export const identityKeys: SpeciesKeyResolver = (name) => ({ species: name, form: 0 });

/**
 * The persistent state as a battle session reads it: members with battle names, and the dex as battle names of every
 * form of each recorded species (the engine checks "owned" per Showdown species, e.g. the Repeat Ball). Never stored.
 */
export function battleView<T extends { party: Member[]; boxes: Member[]; dex: { seen: string[]; owned: string[] } }>(state: T, content: Pick<Content, "species" | "forms" | "speciesKeys" | "meta">): T {
  const names = (ids: string[]): string[] => [...new Set(ids.flatMap((id) => battleNamesOfSpecies(content, id)))];
  return {
    ...state,
    party: state.party.map((m) => toBattleMember(m, content)),
    boxes: state.boxes.map((m) => toBattleMember(m, content)),
    dex: { seen: names(state.dex.seen), owned: names(state.dex.owned) },
  };
}
