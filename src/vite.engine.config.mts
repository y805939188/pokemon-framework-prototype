import { builtinModules } from "node:module";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// Engine bundles: strict-TS sources in framework/ -> single CommonJS files in js/engine/build/.
// ENGINE_ENTRY selects the bundle (default: the engine API). Node built-ins stay external; Showdown is never bundled
// (it is loaded at run time by the one adapter that is allowed to use require).
const entries: Record<string, string> = {
  engine: "./framework/index.ts",
  // runs INSIDE Showdown (staged as dist/config/custom-formats.js): self-contained, rules bundled in
  "custom-formats": "./framework/battle/custom-formats.ts",
  // the core's public entry (rules, state, save schema, digest): no host, no Node, no Showdown; see framework/tsconfig.core.json
  core: "./framework/rules/index.ts",
  // content tooling (build/check/inventory); a Node program, not a library
  "content-cli": "./framework/tools/content-cli.ts",
};
const name = process.env.ENGINE_ENTRY ?? "engine";
const entry = entries[name];
if (!entry) throw new Error(`unknown ENGINE_ENTRY ${name}`);

export default defineConfig({
  build: {
    target: "es2022",
    outDir: fileURLToPath(new URL("../js/engine/build/", import.meta.url)),
    emptyOutDir: false,
    minify: false,
    sourcemap: false,
    lib: {
      entry: fileURLToPath(new URL(entry, import.meta.url)),
      formats: ["cjs"],
      fileName: () => `${name}.cjs`,
    },
    rolldownOptions: {
      platform: "node",
      external: [...builtinModules, /^node:/],
    },
  },
});
