/**
 * MZ side of the versioned game state (framework/rules/save-schema.ts). The persistent state lives in
 * `$gameSystem._psGame`, inside the normal MZ save file; MZ's own save durability applies (this plugin does not make
 * MZ saves atomic). Out-of-battle only: a battle in progress is never saved.
 *
 *   load : the state is migrated on a COPY; success replaces it, failure keeps the raw document and records
 *          `_psSaveError` (battles then refuse to start: nothing is reset, nothing is overwritten by a battle result).
 *   save : the state is validated first; a problem is recorded as `_psSaveWarning` and logged, and the save still
 *          goes ahead (refusing would lose the player's progress; the warning is the diagnostic).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
(() => {
  "use strict";
  const G: any = globalThis;
  const nodeRequire = (globalThis as any).require as any;
  const W = window as any;
  if (!nodeRequire || !G.DataManager) return;

  const schema = (): any => nodeRequire("./js/engine/build/engine.cjs").saveSchema;

  const PSState = (W.PSState = {
    /** Called after MZ restored a save: migrate or diagnose `_psGame`. */
    afterLoad(): void {
      const sys = G.$gameSystem;
      delete sys._psSaveError; delete sys._psSaveInfo; delete sys._psSaveWarning;
      if (sys._psGame === undefined) return; // a save from before the prototype state existed
      const r = schema().migrateGame(sys._psGame);
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
      if (!sys || sys._psGame === undefined || sys._psSaveError) return; // an unusable state is saved as it is
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
  const baseMake = G.DataManager.makeSaveContents;
  G.DataManager.makeSaveContents = function (this: any) {
    PSState.beforeSave();
    return baseMake.call(this);
  };
})();
