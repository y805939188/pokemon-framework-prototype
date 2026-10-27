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
 *          clears the error. Otherwise structure, content references and layout identity are checked synchronously.
 *          A failed check rejects before MZ builds or writes any save; it never repairs the in-memory state.
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

  const schema = (): any => nodeRequire("./js/engine/build/production.cjs").saveSchema;
  const state = (): any => nodeRequire("./js/engine/build/production.cjs").state;

  // JsonEx reserves `constructor` and `@` for class metadata. Framework dictionaries allow both as data IDs.
  // Keep the validated plain snapshot opaque to JsonEx; Game_System itself retains its normal class envelope.
  // This is a host encoding version, independent of the game schema. Older unwrapped saves still load below.
  const encoding = "pokemon-framework-json";
  const unpack = (raw: any): any => {
    if (!raw || typeof raw !== "object" || Object.getOwnPropertyDescriptor(raw, "encoding")?.value !== encoding) return raw;
    const descriptors = Object.getOwnPropertyDescriptors(raw);
    if (Object.keys(descriptors).length !== 3 || descriptors.version?.value !== 1 || typeof descriptors.data?.value !== "string") {
      throw new Error("unsupported or malformed framework save encoding; original document retained");
    }
    return JSON.parse(descriptors.data.value);
  };

  const PSState: any = (W.PSState = {
    lastSaveError: null as any,
    lastSave: null as any,
    /** Called after MZ restored a save: migrate or diagnose `_psGame`. */
    afterLoad(): void {
      const sys = G.$gameSystem;
      delete sys._psSaveError; delete sys._psSaveInfo; delete sys._psSaveWarning;
      const missing = sys._psGame === undefined;
      let content: any;
      let speciesKey: any;
      try {
        content = W.PSFlow.content();
        if (!content?.regionalDex) throw new Error("validated content layout is unavailable");
        speciesKey = W.PSFlow.speciesKeyResolver();
      } catch (error) {
        if (W.PSFlow) W.PSFlow.stateReplaced();
        sys._psSaveError = { code: "needs-content", message: `the content could not be loaded; original state retained: ${String(error instanceof Error ? error.message : error)}` };
        console.error("PS_SaveState: save state not usable:", sys._psSaveError.code, sys._psSaveError.message);
        return;
      }
      if (W.PSFlow) W.PSFlow.stateReplaced();
      if (missing) {
        const empty = state().newGame({ party: [], money: 0, content });
        const problems = schema().validateGameContent(empty, content);
        if (problems.length) { sys._psSaveError = {code: "invalid", message: "empty framework state could not be initialized", problems}; return; }
        sys._psGame = empty;
        sys._psSaveInfo = { from: null, to: empty.schema, migrated: false, created: "empty", notes: ["the save had no framework state: an empty one was created from validated content"] };
        return;
      }
      let document: any;
      try { document = unpack(sys._psGame); } catch (error) {
        sys._psSaveError = {code: "invalid", message: `framework save encoding could not be read; original document retained: ${String(error instanceof Error ? error.message : error)}`};
        console.error("PS_SaveState: save state not usable:", sys._psSaveError.code, sys._psSaveError.message);
        return;
      }
      const r = schema().migrateGame(document, { ...(speciesKey ? { speciesKey } : {}), ...(content ? { content } : {}) });
      if (r.ok) {
        sys._psGame = r.state; // a legitimate explicit layout conversion may also replace a current-version document
        sys._psSaveInfo = { from: r.from, to: r.to, migrated: r.migrated, notes: r.notes };
      } else {
        sys._psSaveError = r.error; // the raw document stays exactly as it was loaded
        console.error("PS_SaveState: save state not usable:", r.error.code, r.error.message);
      }
    },
    /** Synchronous authority shared by saveGame and makeSaveContents. Never migrates or repairs. */
    beforeSave(capture = false): any {
      const sys = G.$gameSystem;
      if (!sys || sys._psGame === undefined) throw new Error("state-unusable: framework state is missing");
      if (sys._psSaveError) throw new Error(`state-unusable: ${sys._psSaveError.code}: ${sys._psSaveError.message}`);
      if (W.PSFlow && (W.PSFlow.running || W.PSFlow.operationPending?.())) throw new Error("operation-pending: saving is not allowed while a framework operation is running");
      let content: any;
      try { content = W.PSFlow.content(); } catch (error) { throw new Error(`needs-content: ${String(error instanceof Error ? error.message : error)}`); }
      if (!content?.regionalDex) throw new Error("needs-content: validated layout is unavailable");
      const prepared = capture ? schema().snapshotForSave(sys._psGame, content) : null;
      const problems = prepared ? (prepared.ok ? [] : prepared.problems) : schema().validateGameContent(sys._psGame, content);
      if (problems.length) throw new Error(`invalid-state: ${problems[0].path} ${problems[0].message}`);
      delete sys._psSaveWarning;
      return prepared?.state;
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
    // No await between this check and MZ's synchronous makeSaveContents recheck.
    try { PSState.beforeSave(); } catch (error) { fail("state-invalid", error); return Promise.reject(error); }
    let p: any;
    try { p = baseSaveGame.call(this, savefileId); } catch (e) { fail("write-failed", e); return Promise.reject(e); }
    return Promise.resolve(p).then((r: any) => { PSState.lastSaveError = null; PSState.lastSave = { savefileId, at: Date.now() }; return r; }, (e: unknown) => { fail("write-failed", e); throw e; });
  };
  // the save menu and autosave follow the same rule (the game's own save permission is never written)
  if (G.Game_System && G.Game_System.prototype && G.Game_System.prototype.isSaveEnabled) {
    const baseIsSaveEnabled = G.Game_System.prototype.isSaveEnabled;
    G.Game_System.prototype.isSaveEnabled = function (this: any) {
      if (!baseIsSaveEnabled.call(this)) return false;
      try { PSState.beforeSave(); return true; } catch { return false; }
    };
  }
  const baseMake = G.DataManager.makeSaveContents;
  G.DataManager.makeSaveContents = function (this: any) {
    let snapshot: any;
    try { snapshot = PSState.beforeSave(true); } catch (error) {
      PSState.lastSaveError = {code: "state-invalid", message: String(error instanceof Error ? error.message : error), savefileId: null, at: Date.now()};
      throw error;
    }
    const contents = baseMake.call(this);
    if (!contents?.system || typeof contents.system !== "object") throw new Error("state-unusable: save contents have no Game_System");
    const descriptors = Object.getOwnPropertyDescriptors(contents.system);
    descriptors._psGame = {value: {encoding, version: 1, data: JSON.stringify(snapshot)}, enumerable: true, configurable: true, writable: true};
    contents.system = Object.create(Object.getPrototypeOf(contents.system), descriptors);
    return contents;
  };
})();
