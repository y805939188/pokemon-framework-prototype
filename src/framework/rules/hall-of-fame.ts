import { publicIdText } from "./member-identity";
import type { Member, Owner } from "./types";

type RegistrationMember = Pick<Member,
  "species" | "form" | "nickname" | "gender" | "level" | "shiny" | "superShiny" | "isEgg"
> & { owner?: Pick<Owner, "id"> };

/** A registration-time display value. No live member ID, references or gameplay state. */
export interface HallOfFameMember {
  readonly species: string;
  readonly form: number;
  readonly nickname: string | null;
  readonly gender: string;
  readonly level: number;
  readonly publicId: string | null;
  readonly shiny: boolean;
  readonly superShiny: boolean;
  readonly isEgg: boolean;
}

type Entry = readonly HallOfFameMember[];

/** Owned in-memory history from the registration rule, ordered oldest to newest. */
export interface HallOfFameHistory {
  readonly entryCount: number;
  readonly entries: readonly Entry[];
}

export interface HallOfFameSnapshot {
  readonly entryCount: number;
  readonly entries: readonly { readonly number: number; readonly members: Entry }[];
}

export function emptyHallOfFame(): HallOfFameHistory {
  return { entryCount: 0, entries: [] };
}

/** Append one supplied party (including eggs). The caller owns qualification and installation. */
export function registerHallOfFame(
  history: HallOfFameHistory, party: readonly Readonly<RegistrationMember>[], limit = 50,
): HallOfFameHistory {
  const members: Entry = party.map(member => ({
    species: member.species,
    form: member.form ?? 0,
    nickname: member.nickname ?? null,
    gender: member.gender,
    level: member.level,
    publicId: member.isEgg ? "?????" : member.owner ? publicIdText(member.owner.id) : null,
    shiny: member.shiny ?? false,
    superShiny: member.superShiny ?? false,
    isEgg: member.isEgg ?? false,
  }));
  const entries = [...history.entries, members];
  // WP67-B removes one entry per registration, even if a lowered limit leaves it over capacity.
  if (limit >= 0 && entries.length > limit) entries.shift();
  return { entryCount: history.entryCount + 1, entries };
}

/** Take one detached view. A positive count can legitimately have no retained entries. */
export function snapshotHallOfFame(history: HallOfFameHistory): HallOfFameSnapshot {
  const first = history.entryCount - history.entries.length + 1;
  return {
    entryCount: history.entryCount,
    entries: history.entries.map((members, i) => ({
      number: first + i,
      members: members.map(member => ({ ...member })),
    })),
  };
}
