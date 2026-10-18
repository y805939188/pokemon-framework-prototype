/**
 * Runtime fixes for RPGReactor on PixiJS 8 (found while measuring step 2.5).
 *
 * LEAK 1 (fixed here, texture): `Sprite.initialize` / `TilingSprite.initialize` give every sprite its own 1x1
 * stub `Texture` on a shared, session-long `TextureSource`. In PixiJS 8 a `Texture` subscribes to its source's
 * `resize` event, so the source keeps every stub alive. When the sprite later gets a bitmap, `_refresh` replaces
 * the stub with a new texture but only destroys the old one if it is marked `__rrSpriteOwned` — the initial stub
 * never is, so each sprite ever created leaks one `Texture` (+ listener). Windows build ~22 sprites, so ~300
 * leaked textures per scene (heap-snapshot evidence; ~1.5-2.5 MB RSS per scene, no plateau over 100 battles).
 * Fix: after `_refresh` swapped the texture, destroy the replaced one if it was the stub on the shared empty
 * source (destroying a Texture does not destroy its source). Sprites that have no bitmap keep their stub, and
 * `Sprite.destroy()` already removes theirs.
 *
 * LEAK 2 (fixed here, batcher): PixiJS 8 creates a batcher per render-group instruction set in
 * `renderer.renderPipes.batch._batchersByInstructionSet` and never removes it when that render group (a scene)
 * is gone. Each stale entry keeps its last `Batch`es, `BatchableSprite`s and through them textures and canvases
 * alive (snapshot: ~3,300 sprites / 1,000 batches / 300 canvases after 40 battles; +2 entries per scene change).
 * Fix: a few frames after every scene change, drop the entries whose instruction set belongs to no live render
 * group under the stage. Uses PixiJS internals (guarded; does nothing if the shape differs).
 *
 * Optional (off unless asked): destroy a scene after it was terminated (MZ itself never does). Enable with the
 * command line flag `--ps-fix=scene`. Measured to make no difference to memory.
 *
 * This belongs upstream in RPGReactor (`reactor_core.js`, Sprite/TilingSprite `_refresh`); remove this plugin
 * once the pinned Reactor version contains the fix.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
(() => {
  "use strict";
  const G: any = globalThis;
  if (G.__psRuntimeFixes) return;
  G.__psRuntimeFixes = { textureFix: false, sceneFix: false, batcherFix: false, prunedBatchers: 0 };
  const argv: string[] = (G.nw && G.nw.App && G.nw.App.argv) || [];
  const flags = (argv.find((a) => a.startsWith("--ps-fix=")) || "").slice(9).split(",");

  // The class the runtime reads `_emptyBaseTexture` from is looked up by name at call time: pixi_compat can
  // replace the global after this plugin captured it, leaving the captured object without the static.
  function guardRefresh(name: string): void {
    const proto = G[name] && G[name].prototype;
    if (!proto || typeof proto._refresh !== "function" || proto.__psRefreshGuard) return;
    proto.__psRefreshGuard = true;
    const base = proto._refresh;
    proto._refresh = function (this: any, ...args: any[]) {
      const before = this.texture;
      const result = base.apply(this, args);
      const empty = G[name] && G[name]._emptyBaseTexture;
      const emptySource = empty && empty.source;
      if (before && before !== this.texture && !before.destroyed && !before.__rrSpriteOwned && emptySource && before.source === emptySource) {
        try { before.destroy(); } catch (e) { /* already released */ }
      }
      return result;
    };
  }
  if (!flags.includes("no-texture")) {
    guardRefresh("Sprite");
    guardRefresh("TilingSprite");
    G.__psRuntimeFixes.textureFix = true;
  }

  function pruneBatchers(): void {
    try {
      const app = G.Graphics && G.Graphics.app;
      const pipe = app && app.renderer && app.renderer.renderPipes && app.renderer.renderPipes.batch;
      const map = pipe && pipe._batchersByInstructionSet;
      if (!map || !app.stage) return;
      const live = new Set<string>();
      const walk = (c: any) => {
        if (c.renderGroup && c.renderGroup.instructionSet) live.add(String(c.renderGroup.instructionSet.uid));
        for (const ch of c.children || []) walk(ch);
      };
      walk(app.stage);
      if (!live.size) return; // cannot tell what is live: leave everything alone
      let removed = 0;
      for (const key of Object.keys(map)) {
        if (live.has(key)) continue;
        const entry = map[key];
        for (const name of Object.keys(entry || {})) { try { entry[name].destroy && entry[name].destroy(); } catch (e) { /* ignore */ } }
        delete map[key];
        removed++;
      }
      G.__psRuntimeFixes.prunedBatchers += removed;
    } catch (e) { /* internals differ: skip */ }
  }
  if (!flags.includes("no-batcher")) {
    G.__psRuntimeFixes.batcherFix = true; G.__psRuntimeFixes.prunedBatchers = 0;
    const SM2 = G.SceneManager;
    const base2 = SM2.changeScene;
    SM2.changeScene = function (this: any, ...args: any[]) {
      const changing = this.isSceneChanging() && !this.isCurrentSceneBusy();
      const r = base2.apply(this, args);
      if (changing) setTimeout(pruneBatchers, 400);
      return r;
    };
  }

  if (flags.includes("scene")) {
    const SM = G.SceneManager;
    const base = SM.changeScene;
    SM.changeScene = function (this: any, ...args: any[]) {
      const changing = this.isSceneChanging() && !this.isCurrentSceneBusy();
      const old = this._scene;
      const r = base.apply(this, args);
      if (changing && old && old !== this._scene && !old.__psDestroyed) {
        old.__psDestroyed = true;
        try { old.destroy(); } catch (e) { console.warn("PS_RuntimeFixes: scene destroy failed (ignored)", e); }
      }
      return r;
    };
    G.__psRuntimeFixes.sceneFix = true;
  }
})();
