/**
 * MZ side of the versioned game state (framework/rules/save-schema.ts). The persistent state lives in
 * `$gameSystem._psGame`, inside the normal MZ save file; MZ's own save durability applies (this plugin does not make
 * MZ saves atomic). Out-of-battle only: a battle in progress is never saved.
 *
 *   load : the state is migrated on a COPY; success replaces it, failure keeps the raw document and records
 *          `_psSaveError` (battles then refuse to start: nothing is reset, nothing is overwritten by a battle result).
 *          From schema 3 to 4 the migration needs the game content (Showdown name -> content id + form, decision D5-3);
 *          content that cannot be loaded, or a species it cannot map, refuses the migration the same way. A battle still
 *          open in the application, and the host's battle operation, are released.
 *          A save with NO framework state (made before the framework state existed, or before any of it was used) gets
 *          the formal empty state (no members, no items, money 0, nothing claimed) and `_psSaveInfo.created` says so:
 *          no player data is invented.
 *   save : while the loaded framework state is unusable (`_psSaveError`), every save is refused BEFORE MZ writes
 *          anything (code state-unusable, with the slot): the save file the state came from, and every other slot, stay
 *          exactly as they are, and the save menu is masked (Game_System.isSaveEnabled). A new game or a good load
 *          clears the error. Otherwise the state is validated first; a problem is recorded as `_psSaveWarning` and
 *          logged, and the save still goes ahead (refusing would lose the player's progress; the warning is the diagnostic).
 *          While a battle runs (PSFlow.running) every save is refused, including a direct DataManager.saveGame call (the
 *          menu and autosave are already off: PS_BattleFlow masks Game_System.isSaveEnabled). A refused or failed save is recorded in
 *          PSState.lastSaveError {code: state-unusable | battle-running | write-failed, message, savefileId, at} and logged.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
(() => {
  "use strict";
  const G: any = globalThis;
  const nodeRequire = (globalThis as any).require as any;
  const W = window as any;
  if (!nodeRequire || !G.DataManager) return;

  const schema = (): any => nodeRequire("./js/engine/build/engine.cjs").saveSchema;
  const state = (): any => nodeRequire("./js/engine/build/engine.cjs").state;

  const PSState: any = (W.PSState = {
    lastSaveError: null as any,
    lastSave: null as any,
    /** Called after MZ restored a save: migrate or diagnose `_psGame`. */
    afterLoad(): void {
      const sys = G.$gameSystem;
      delete sys._psSaveError; delete sys._psSaveInfo; delete sys._psSaveWarning;
      if (sys._psGame === undefined) {
        if (W.PSFlow) W.PSFlow.stateReplaced();
        sys._psGame = state().newGame({ party: [], money: 0 });
        sys._psSaveInfo = { from: null, to: sys._psGame.schema, migrated: false, created: "empty", notes: ["the save had no framework state: an empty one was created (no members, no items, money 0, nothing claimed)"] };
        return;
      }
      let speciesKey: any;
      let content: any;
      let contentError = "";
      if (typeof sys._psGame === "object" && sys._psGame && typeof sys._psGame.schema === "number" && sys._psGame.schema < 5) {
        try { content = W.PSFlow.content(); speciesKey = W.PSFlow.speciesKeyResolver(); } catch (e) { contentError = String(e instanceof Error ? e.message : e); }
      }
      if (W.PSFlow) W.PSFlow.stateReplaced();
      const r = schema().migrateGame(sys._psGame, { ...(speciesKey ? { speciesKey } : {}), ...(content ? { content } : {}) });
      if (!r.ok && r.error.code === "needs-content" && contentError) r.error.message += ` (the content could not be loaded: ${contentError})`;
      if (r.ok) {
        if (r.migrated) sys._psGame = r.state;
        sys._psSaveInfo = { from: r.from, to: r.to, migrated: r.migrated, notes: r.notes };
      } else {
        sys._psSaveError = r.error; // the raw document stays exactly as it was loaded
        console.error("PS_SaveState: save state not usable:", r.error.code, r.error.message);
      }
    },
    /** Called right before MZ builds the save contents. */
    beforeSave(): void {
      const sys = G.$gameSystem;
      if (!sys || sys._psGame === undefined || sys._psSaveError) return; // an unusable state never gets this far (saveGame refuses)
      const problems = schema().validateGame(sys._psGame);
      if (problems.length) { sys._psSaveWarning = { problems: problems.slice(0, 10) }; console.warn("PS_SaveState: saving a state that fails validation:", problems[0]); }
      else delete sys._psSaveWarning;
    },
  });

  const baseExtract = G.DataManager.extractSaveContents;
  G.DataManager.extractSaveContents = function (this: any, contents: any) {
    baseExtract.call(this, contents);
    PSState.afterLoad();
  };
  const baseSaveGame = G.DataManager.saveGame;
  G.DataManager.saveGame = function (this: any, savefileId: number) {
    const fail = (code: string, e: unknown) => {
      PSState.lastSaveError = { code, message: String(e instanceof Error ? e.message : e), savefileId, at: Date.now() };
      console.error("PS_SaveState: save not written:", code, PSState.lastSaveError.message);
    };
    const unusable = G.$gameSystem && G.$gameSystem._psSaveError;
    if (unusable) {
      // migration failed or the document was not understood: writing now would replace the original save file (or
      // another slot) with a state this build could not read; nothing is written, the player keeps the original
      const e = new Error(`saving to slot ${savefileId} is refused: the framework state of the loaded save is not usable (${unusable.code}: ${unusable.message}); nothing was written`);
      fail("state-unusable", e);
      return Promise.reject(e);
    }
    if (W.PSFlow && (W.PSFlow.running || W.PSFlow.operationPending?.())) {
      const e = new Error("saving is not allowed while a battle is running");
      fail(W.PSFlow.running ? "battle-running" : "operation-pending", e);
      return Promise.reject(e);
    }
    let p: any;
    try { p = baseSaveGame.call(this, savefileId); } catch (e) { fail("write-failed", e); return Promise.reject(e); }
    return Promise.resolve(p).then((r: any) => { PSState.lastSaveError = null; PSState.lastSave = { savefileId, at: Date.now() }; return r; }, (e: unknown) => { fail("write-failed", e); throw e; });
  };
  // the save menu and autosave follow the same rule (the game's own save permission is never written)
  if (G.Game_System && G.Game_System.prototype && G.Game_System.prototype.isSaveEnabled) {
    const baseIsSaveEnabled = G.Game_System.prototype.isSaveEnabled;
    G.Game_System.prototype.isSaveEnabled = function (this: any) { return !this._psSaveError && baseIsSaveEnabled.call(this); };
  }
  const baseMake = G.DataManager.makeSaveContents;
  G.DataManager.makeSaveContents = function (this: any) {
    PSState.beforeSave();
    return baseMake.call(this);
  };
})();
