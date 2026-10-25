import { dexLayoutIdentity } from "../../rules/dex-state.ts";
import { legacyCatalog } from "../../rules/item-catalog.ts";
/**
 * FIXTURE content (step 2.3): the synthetic test content. Base stats come from Showdown's gen8 data (cross-checked in
 * tests); growth rate / base exp / EV yield / catch rate are stand-in values entered by hand, and learnsets are
 * SYNTHETIC (chosen to exercise level-up learning), not authoritative data. Kept as a fixture on purpose: runtime
 * entry points use the content pipeline's small real sample instead (step 3, batch B).
 */
import type { Content } from "../../rules/types.ts";

export const FIXTURE_MOVE_PP: Record<string,number> = { flamethrower: 15, airslash: 15, dragonpulse: 10, roost: 10, hydropump: 5, icebeam: 10, flashcannon: 10, protect: 10, gigadrain: 10, sludgebomb: 10, earthquake: 10, synthesis: 5, tackle: 35, gust: 35, quickattack: 30, bodyslam: 15, shadowball: 15, crunch: 15, rest: 10, slash:20, outrage:10, heatwave:10, waterfall:15, powerwhip:10 };

const fixtureItems=legacyCatalog();
for(const id of ['leftovers','oranberry','sitrusberry','choiceband','not-an-item','__proto__','constructor'])Object.defineProperty(fixtureItems,id,{value:{...fixtureItems.potion!,id,battleId:id,legacyIds:[id],source:'synthetic-held-fixture'},enumerable:true});
export const fixtureContent: Content = {
  items:fixtureItems,
  moves: Object.fromEntries(Object.entries(FIXTURE_MOVE_PP).map(([id,pp])=>[id,{id,name:id,pp}])),
  meta: { kind: "fixture", id: "step2-fixture" },
  species: {
    Charizard: { base: { hp: 78, atk: 84, def: 78, spa: 109, spd: 85, spe: 100 }, growth: "parabolic", baseExp: 267, evYield: { spa: 3 }, catchRate: 45,
      learnset: { 51: ["Slash"], 52: ["Outrage"], 53: ["Heat Wave"] } },
    Blastoise: { base: { hp: 79, atk: 83, def: 100, spa: 85, spd: 105, spe: 78 }, growth: "parabolic", baseExp: 265, evYield: { spd: 3 }, catchRate: 45,
      learnset: { 51: ["Waterfall"] } },
    Venusaur: { base: { hp: 80, atk: 82, def: 83, spa: 100, spd: 100, spe: 80 }, growth: "parabolic", baseExp: 263, evYield: { spa: 2, spd: 1 }, catchRate: 45,
      learnset: { 51: ["Power Whip"] } },
    Snorlax: { base: { hp: 160, atk: 110, def: 65, spa: 65, spd: 110, spe: 30 }, growth: "slow", baseExp: 189, evYield: { hp: 2 }, catchRate: 25, learnset: {} },
    Gengar: { base: { hp: 60, atk: 65, def: 60, spa: 130, spd: 75, spe: 110 }, growth: "parabolic", baseExp: 250, evYield: { spa: 3 }, catchRate: 45, learnset: {} },
    Pidgey: { base: { hp: 40, atk: 45, def: 40, spa: 35, spd: 35, spe: 56 }, growth: "parabolic", baseExp: 50, evYield: { spe: 1 }, catchRate: 255, learnset: {} },
    Caterpie: { base: { hp: 45, atk: 30, def: 35, spa: 20, spd: 20, spe: 45 }, growth: "medium", baseExp: 39, evYield: { hp: 1 }, catchRate: 255, learnset: {} },
  },
};

// Explicit synthetic catalog/layout for current-schema headless fixtures, never a runtime content fallback.
const national = Object.keys(fixtureContent.species);
fixtureContent.regionalDex = { national, regions: [], layoutIdentity: dexLayoutIdentity({national, regions: []}) };
fixtureContent.abilities = Object.fromEntries(["Blaze", "Torrent", "Overgrow", "Immunity", "Thick Fat", "Keen Eye", "Run Away", "Shield Dust", "Levitate", "Intimidate", "Static", "Poison Point", "Pressure", "Adaptability"].map(name => [name.toLowerCase().replace(/[^a-z0-9]/g, ""), {id: name.toLowerCase().replace(/[^a-z0-9]/g, ""), name}]));
