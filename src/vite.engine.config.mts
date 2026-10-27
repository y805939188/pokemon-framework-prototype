import { builtinModules } from "node:module";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// Engine bundles: strict-TS sources in framework/ -> CommonJS files in js/engine/build/.
// production/testing/legacy are built together so their common production modules are shared chunks, not duplicate
// constructors or transaction registries. The portable core remains a separate host-free standalone bundle.
const runtimeEntries: Record<string, string> = {
  engine: "./framework/index.ts",
  production: "./framework/production.ts",
  testing: "./framework/testing.ts",
};
const entries: Record<string, string> = {
  // runs INSIDE Showdown (staged as dist/config/custom-formats.js): self-contained, rules bundled in
  "custom-formats": "./framework/battle/custom-formats.ts",
  // the core's public entry (rules, state, save schema, digest): no host, no Node, no Showdown; see framework/tsconfig.core.json
  core: "./framework/rules/index.ts",
  // content tooling (build/check/inventory); a Node program, not a library
  "content-cli": "./framework/tools/content-cli.ts",
};
const name = process.env.ENGINE_ENTRY ?? "runtime";
const selected = name === "runtime" ? runtimeEntries : entries[name];
if (!selected) throw new Error(`unknown ENGINE_ENTRY ${name}`);
const absolute = (entry: string) => fileURLToPath(new URL(entry, import.meta.url));
const entry = typeof selected === "string"
  ? absolute(selected)
  : Object.fromEntries(Object.entries(selected).map(([entryName, source]) => [entryName, absolute(source)]));

export default defineConfig({
  build: {
    target: "es2022",
    outDir: fileURLToPath(new URL("../js/engine/build/", import.meta.url)),
    // The runtime build is first and removes stale shared chunks; subsequent independent entries preserve it.
    emptyOutDir: name === "runtime",
    minify: false,
    sourcemap: false,
    lib: {
      entry,
      formats: ["cjs"],
      fileName: (_format, entryName) => `${name === "runtime" ? entryName : name}.cjs`,
    },
    rolldownOptions: {
      platform: "node",
      external: [...builtinModules, /^node:/],
    },
  },
});
