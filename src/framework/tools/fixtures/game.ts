/** Synthetic game fixtures for headless tests, the scripted matrix and the flow test (not shipped content). */
import * as G from "../../rules/growth.ts";
import * as S from "../../rules/state.ts";
import type { GameState } from "../../rules/state.ts";
import { toPersistentMember } from "../../rules/species-key.ts";
import type { Content, Member, PartialStats } from "../../rules/types.ts";
import { fixtureContent as content } from "./content.ts";

export { content };

export const PP: Record<string, number> = { flamethrower: 15, airslash: 15, dragonpulse: 10, roost: 10, hydropump: 5, icebeam: 10, flashcannon: 10, protect: 10, gigadrain: 10, sludgebomb: 10, earthquake: 10, synthesis: 5, tackle: 35, gust: 35, quickattack: 30, bodyslam: 15, shadowball: 15, crunch: 15, rest: 10 };

export interface MemberOptions {
  moves: string[];
  nature?: string;
  evs?: PartialStats;
  expOffset?: number;
  hp?: number;
  gender?: string;
  ability?: string;
  item?: string;
}

/** A persistent party member of the fixture world: the Showdown name is its content id, form 0 (D5-3). */
export function member(id: string, species: string, level: number, { moves, nature = "timid", evs = {}, expOffset = 0, hp, gender = "M", ability, item = "" }: MemberOptions): S.NewMemberInput {
  const sp = content.species[species]!;
  const stats = G.computeStats(sp.base, { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, ...evs }, level, nature);
  return {
    id, species, form: 0, level, exp: G.minExp(sp.growth, level) + expOffset, hp: hp ?? stats.hp, status: "", item, ability: ability || "Blaze", nature, gender,
    evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, ...evs },
    moves: moves.map((m) => ({ id: m, pp: PP[m]!, maxpp: PP[m]! })),
  };
}

export interface GameOverrides {
  charizard?: Partial<MemberOptions>;
  bag?: Record<string, number>;
}

export function makeGame(over: GameOverrides = {}): GameState {
  return S.newGame({
    party: [
      member("A-0001", "Charizard", 50, { moves: ["flamethrower", "airslash", "dragonpulse", "roost"], ability: "Blaze", ...(over.charizard ?? {}) }),
      member("A-0002", "Blastoise", 50, { moves: ["hydropump", "icebeam", "flashcannon", "protect"], nature: "modest", ability: "Torrent" }),
      member("A-0003", "Venusaur", 50, { moves: ["gigadrain", "sludgebomb", "earthquake", "synthesis"], nature: "modest", ability: "Overgrow" }),
    ],
    bag: { potion: 3, antidote: 1, xattack: 1, pokeball: 5, masterball: 1, ...(over.bag ?? {}) },
    money: 1000,
  });
}

/**
 * A fixture game stored the way a save stores it for `target` content (decision D5-3): its members keyed by that
 * content's ids + form. The fixture world itself needs no conversion (its content ids are the Showdown names).
 */
export function savedFor(game: GameState, target: Content): GameState {
  return { ...game, party: game.party.map((m) => toPersistentMember(m, target)), storage: { ...game.storage, boxes: game.storage.boxes.map((b) => ({ ...b, slots: b.slots.map((m) => m ? toPersistentMember(m, target) : null) })) } };
}

export interface FoeOptions {
  moves?: string[];
  nature?: string;
  ability?: string;
  ivs?: PartialStats;
  evs?: PartialStats;
}

/** A battle foe record (no persistent extras: ivs/evs only feed the stat computation). */
export function foeMember(id: string, species: string, level: number, { moves = ["tackle", "gust"], nature = "hardy", ability = "Keen Eye", ivs, evs }: FoeOptions = {}): Member {
  const sp = content.species[species]!;
  const stats = G.computeStats(sp.base, ivs ?? { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, evs ?? {}, level, nature);
  return {
    id, species, level, exp: G.minExp(sp.growth, level), hp: stats.hp, status: "", item: "", ability, nature, gender: "M",
    moves: moves.map((m) => ({ id: m, pp: PP[m]!, maxpp: PP[m]! })),
  };
}
