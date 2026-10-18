import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// One IIFE bundle per run. Select the plugin with RR_PLUGIN (default: the template demo);
// `pnpm build` runs every plugin listed in package.json.
const pluginName = process.env.RR_PLUGIN ?? "RR_Pixi8Particles";

const pluginEntry = fileURLToPath(
  new URL(`./plugins/${pluginName}.ts`, import.meta.url),
);

const pluginMetadata = readFileSync(
  fileURLToPath(
    new URL(`./plugins/${pluginName}.meta.txt`, import.meta.url),
  ),
  "utf8",
).trim();

const pluginOutputDir = fileURLToPath(
  new URL("../js/plugins/", import.meta.url),
);

export default defineConfig({
  build: {
    target: "es2022",

    outDir: pluginOutputDir,
    emptyOutDir: false,

    minify: false,
    sourcemap: true,

    lib: {
      entry: pluginEntry,
      name: `${pluginName}Bundle`,
      formats: ["iife"],
      fileName: () => `${pluginName}.js`,
    },

    rolldownOptions: {
      external: ["pixi.js"],

      output: {
        banner: pluginMetadata,

        globals: {
          "pixi.js": "PIXI",
        },
      },
    },
  },
});
