/**
 * The ONE adapter that loads the pinned Showdown build at run time (and its RPG format extension).
 * Showdown is CommonJS, resolves its data files by path and uses Node built-ins, so it cannot be bundled and cannot be
 * loaded with `import()` inside NW.js (measured: step 3 / A2 spike, `docs/step3/README.md`). `require` is therefore
 * allowed in this file and nowhere else in the framework sources.
 */
import fs from "node:fs";
import path from "node:path";
import type { ShowdownSim, ShowdownBattle } from "./showdown-types";
import type { FormatObserver } from "../rules/battle-evidence";
import type { HeldRuntimeObserver } from "../rules/held-facts";
import { restoreSpeciesTypes } from './species-types';

// The bundle is CommonJS, so the real Node `require` is in scope here (and is the one NW.js gives to the page).
const nodeRequire: NodeJS.Require = require;

export interface LoadedSim {
  sim: ShowdownSim;
  extractChannelMessages: (text: string, channels: number[]) => string[][];
  root: string;
}

/** Engine root defaults to js/engine/showdown next to the built artifact (js/engine/build/engine.cjs). */
export function defaultEngineRoot(): string {
  return path.join(__dirname, "..", "showdown");
}

export function loadSim(engineRoot?: string): LoadedSim {
  const root = engineRoot || defaultEngineRoot();
  const sim = nodeRequire(path.join(root, "dist", "sim"));
  const { extractChannelMessages } = nodeRequire(path.join(root, "dist", "sim", "battle"));
  return { sim, extractChannelMessages, root };
}

/**
 * Pinned State.deserializePokemon assumes every permanent slot has a same-index active slot.
 * Transform legitimately violates that assumption. Decode its permanent list separately with
 * the native reference codec, before exposing the restored battle or attaching live callbacks.
 * Neither the snapshot nor the live battle is padded with invented selectable moves.
 */
export function restoreSimBattle(env: LoadedSim, snapshot: string): ShowdownBattle {
  const state = JSON.parse(snapshot);
  const detached: { side: number; member: number; slots: unknown[] }[] = [];
  for (const [side, team] of state.sides.entries()) {
    for (const [member, pokemon] of team.pokemon.entries()) {
      if (pokemon.transformed && Array.isArray(pokemon.baseMoveSlots) && Array.isArray(pokemon.moveSlots)
        && pokemon.baseMoveSlots.length > pokemon.moveSlots.length) {
        detached.push({ side, member, slots: pokemon.baseMoveSlots });
        delete pokemon.baseMoveSlots;
      }
    }
  }
  const battle = env.sim.Battle.fromJSON(state);
  restoreSpeciesTypes(battle, state);
  if (detached.length) {
    const { State } = nodeRequire(path.join(env.root, "dist", "sim", "state"));
    for (const saved of detached) {
      battle.sides[saved.side].pokemon[saved.member].baseMoveSlots = State.deserializeWithRefs(saved.slots, battle);
    }
    // Native deserialization derives requests before the permanent slots above are restored.
    // Rebuild only those derived values, retaining the native null/no-request distinction.
    const requests = battle.getRequests(battle.requestState);
    for (const [index, side] of state.sides.entries()) {
      battle.sides[index].activeRequest = side.activeRequest === null ? null : requests[index];
    }
  }
  return battle;
}

/** The SHA the staged Showdown build was made from (written by scripts/build-showdown.sh). */
export function readEngineSha(root: string): string {
  try { return fs.readFileSync(path.join(root, "SOURCE_SHA"), "utf8").trim(); } catch { return "unknown"; }
}

/** The staged RPG format extension (a copy of the custom-formats build); it owns the non-serialized hooks table. */
export function loadFormatExtension(root: string): { hooks: WeakMap<object, (e: unknown) => void>; observers: WeakMap<object, FormatObserver>; initialFields?: { bind(battle: ShowdownBattle, raw: unknown): void; attach(battle: ShowdownBattle): void; snapshot<T>(battle: ShowdownBattle, serialize: () => T): T }; settlements?: WeakMap<object, HeldRuntimeObserver>; runAfterFaint?: (battle: ShowdownBattle, side: string) => boolean } {
  return nodeRequire(path.join(root, "dist", "config", "custom-formats.js"));
}
