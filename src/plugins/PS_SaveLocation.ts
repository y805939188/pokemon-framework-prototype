/**
 * Where saves live (runtime-issues pass after C2).
 *
 * Stock MZ/Reactor writes saves to `<app.nw>/save`. In a packaged macOS app that directory is INSIDE the signed
 * bundle: writing there modifies the sealed bundle (breaks the code signature that Developer ID signing and
 * notarization depend on), and fails or goes to a throwaway copy when the app is installed read-only or runs
 * translocated. Saves must also survive replacing the app with a new build.
 *
 * Rule (mode=auto): when running from a packaged app (the game directory is inside `*.app/Contents/Resources`)
 * use the per-user data folder `~/Library/Application Support/<manifest name>/save/`; in development and in the
 * editor's Playtest keep `<project>/save/` exactly as before. `--ps-save-dir=<dir>` overrides everything (tests).
 * macOS only for now; other platforms keep the project folder until they are in scope.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
(() => {
  "use strict";
  const G: any = globalThis;
  const nodeRequire: any = G.require;
  if (!nodeRequire || !G.StorageManager) return;
  const params = G.PluginManager.parameters("PS_SaveLocation") as Record<string, string>;
  const argv: string[] = (G.nw && G.nw.App && G.nw.App.argv) || [];
  const override = (argv.find((a) => a.startsWith("--ps-save-dir=")) || "").slice(14);
  const path = nodeRequire("path");
  const os = nodeRequire("os");

  function decide(): { dir: string; why: string } {
    // the project folder = two levels above js/plugins.js, resolved relative to index.html (process.mainModule is deprecated)
    const gameDir = path.dirname(path.dirname(nodeRequire.resolve("./js/plugins.js")));
    if (override) return { dir: path.resolve(override) + path.sep, why: "--ps-save-dir" };
    const mode = params.mode || "auto";
    const packaged = /\.app[\\/]Contents[\\/]Resources[\\/]/.test(gameDir);
    if (G.process.platform === "darwin" && (mode === "user" || (mode === "auto" && packaged))) {
      const name = String((G.nw && G.nw.App && G.nw.App.manifest && G.nw.App.manifest.name) || "game").replace(/[^A-Za-z0-9._-]/g, "_");
      return { dir: path.join(os.homedir(), "Library", "Application Support", name, "save") + path.sep, why: packaged ? "packaged app" : "mode=user" };
    }
    return { dir: path.join(gameDir, "save") + path.sep, why: "project folder" };
  }

  const chosen = decide();
  G.PSSaveLocation = chosen;
  G.StorageManager.fileDirectoryPath = function () {
    return chosen.dir;
  };
})();
