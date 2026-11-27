import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { MAC_NW_PROFILE_DEFAULT, NATIVE_PROFILE_FILE } from "./plugins/isolated-profile-contract";

// One IIFE bundle per run. Select the plugin with RR_PLUGIN (default: the template demo);
// `pnpm build` runs every plugin listed in package.json.
const pluginName = process.env.RR_PLUGIN ?? "RR_Pixi8Particles";

// Default builds have no test scope. A scoped variant can only be emitted into
// an owner-only, ignored workspace stage; it cannot override js/plugins in the tool tree.
const requestedStage = process.env.RR_ISOLATED_TEST_STAGE;
function stageDirectory(directory: string): string {
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || (stat.mode & 0o077) !== 0) throw Error("isolated test stage must use private directories");
  return realpathSync(directory);
}
let testStage: { root: string; epoch: string; nativeProfile?: typeof MAC_NW_PROFILE_DEFAULT } | null = null;
if (requestedStage !== undefined) {
  if (!isAbsolute(requestedStage) || !["PS_BattleFlow", "PS_BattleFlowTest", "PS_BattleSmoke", "PS_SaveLocation", "PS_RuntimeFixes", "PS_World", "PS_Management"].includes(pluginName)) {
    throw Error("isolated test build requires an absolute private workspace stage and a supported plugin");
  }
  const workspace = realpathSync(fileURLToPath(new URL("..", import.meta.url)));
  const root = stageDirectory(requestedStage), stageParent = join(workspace, "build", "isolated-launch");
  if (root !== resolve(requestedStage) || dirname(root) !== stageParent || stageDirectory(stageParent) !== stageParent) {
    throw Error("isolated test stage must be directly in the workspace build/isolated-launch directory");
  }
  for (const dir of ["game", "game/js", "game/js/plugins", "profile", "saves"]) stageDirectory(join(root, dir));
  const stamp = join(root, ".pf-isolated-stage"), stat = lstatSync(stamp);
  if (!stat.isFile() || (stat.mode & 0o077) !== 0) throw Error("isolated test stage requires a private stage stamp");
  const stampText = readFileSync(stamp, "utf8");
  if (!/^[a-f0-9]{64}\n$/.test(stampText)) throw Error("isolated test stage stamp is invalid");
  testStage = { root, epoch: stampText.trimEnd() };
  const nativeProfile = join(root, NATIVE_PROFILE_FILE);
  const nativeStat = lstatSync(nativeProfile, { throwIfNoEntry: false });
  if (nativeStat) {
    if (!nativeStat.isFile() || (nativeStat.mode & 0o077) !== 0 || nativeStat.uid !== process.getuid?.() || nativeStat.nlink !== 1 ||
        readFileSync(nativeProfile, "utf8") !== MAC_NW_PROFILE_DEFAULT + "\n") {
      throw Error("isolated native profile contract is unavailable");
    }
    for (const dir of ["home", "tmp"]) if (stageDirectory(join(root, dir)) !== join(root, dir)) {
      throw Error("isolated native home or temporary path is unavailable");
    }
    testStage.nativeProfile = MAC_NW_PROFILE_DEFAULT;
  }
}

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
const outputDir = testStage === null ? pluginOutputDir : join(testStage.root, "game/js/plugins");
const scopedBanner = testStage === null ? "" : "\n// PF-SCOPED-IIFE-v1 " + pluginName + " " +
  createHash("sha256").update(JSON.stringify([pluginName, testStage.root, testStage.epoch,
    ...(testStage.nativeProfile ? [testStage.nativeProfile] : [])])).digest("hex");

export default defineConfig({
  define: { __PS_ISOLATED_TEST_STAGE__: JSON.stringify(testStage) },
  build: {
    target: "es2022",

    outDir: outputDir,
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
        banner: pluginMetadata + scopedBanner,

        globals: {
          "pixi.js": "PIXI",
        },
      },
    },
  },
});
