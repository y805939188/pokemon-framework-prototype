/**
 * The ONE adapter that loads the pinned Showdown build at run time (and its RPG format extension).
 * Showdown is CommonJS, resolves its data files by path and uses Node built-ins, so it cannot be bundled and cannot be
 * loaded with `import()` inside NW.js (measured: step 3 / A2 spike, `docs/step3/README.md`). `require` is therefore
 * allowed in this file and nowhere else in the framework sources.
 */
import fs from "node:fs";
import path from "node:path";
import type { ShowdownSim } from "./showdown-types.ts";
import type { FormatObserver } from "../rules/battle-evidence.ts";

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

/** The SHA the staged Showdown build was made from (written by scripts/build-showdown.sh). */
export function readEngineSha(root: string): string {
  try { return fs.readFileSync(path.join(root, "SOURCE_SHA"), "utf8").trim(); } catch { return "unknown"; }
}

/** The staged RPG format extension (a copy of the custom-formats build); it owns the non-serialized hooks table. */
export function loadFormatExtension(root: string): { hooks: WeakMap<object, (e: unknown) => void>; observers: WeakMap<object, FormatObserver> } {
  return nodeRequire(path.join(root, "dist", "config", "custom-formats.js"));
}
