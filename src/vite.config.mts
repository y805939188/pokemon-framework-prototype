import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const pluginEntry = fileURLToPath(
  new URL("./plugins/RR_Pixi8Particles.ts", import.meta.url),
);

const pluginMetadata = readFileSync(
  fileURLToPath(
    new URL("./plugins/RR_Pixi8Particles.meta.txt", import.meta.url),
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
      name: "RR_Pixi8ParticlesBundle",
      formats: ["iife"],
      fileName: () => "RR_Pixi8Particles.js",
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
