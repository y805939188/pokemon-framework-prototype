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
  let ordinaryWrites = 0, ordinaryLoads = 0;
  // Owned only by the event command. Pause map simulation, never SceneManager or its UI/Graphics loop.
  let friendshipModal: { scene: any; abort(): void } | null = null;
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
      if (friendshipModal) throw new Error("friendship-preview-active: finish the migration choice before saving");
      const sys = G.$gameSystem;
      if (!sys || sys._psGame === undefined) throw new Error("state-unusable: framework state is missing");
      if (sys._psSaveError) throw new Error(`state-unusable: ${sys._psSaveError.code}: ${sys._psSaveError.message}`);
      if (W.PSFlow && (W.PSFlow.running || W.PSFlow.operationPending?.())) { W.PSFlow._app?.assertHostStateReplacementAllowed?.(); throw new Error("operation-pending: saving is not allowed while a framework operation is running"); }
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
    assertReplacement();
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
    if (friendshipModal) return Promise.reject(new Error("friendship-preview-active: finish the migration choice before saving"));
    if (unusable) {
      // migration failed or the document was not understood: writing now would replace the original save file (or
      // another slot) with a state this build could not read; nothing is written, the player keeps the original
      const e = new Error(`saving to slot ${savefileId} is refused: the framework state of the loaded save is not usable (${unusable.code}: ${unusable.message}); nothing was written`);
      fail("state-unusable", e);
      return Promise.reject(e);
    }
    if (W.PSFlow && (W.PSFlow.running || W.PSFlow.operationPending?.())) {
      try { W.PSFlow._app?.assertHostStateReplacementAllowed?.(); } catch(error) { fail("operation-pending",error); return Promise.reject(error); }
      const e = new Error("saving is not allowed while a battle is running");
      fail(W.PSFlow.running ? "battle-running" : "operation-pending", e);
      return Promise.reject(e);
    }
    // No await between this check and MZ's synchronous makeSaveContents recheck.
    try { PSState.beforeSave(); } catch (error) { fail("state-invalid", error); return Promise.reject(error); }
    let p: any; ordinaryWrites++;
    try { p = baseSaveGame.call(this, savefileId); } catch (e) { ordinaryWrites--; fail("write-failed", e); return Promise.reject(e); }
    return Promise.resolve(p).finally(()=>{ordinaryWrites--;}).then((r: any) => { PSState.lastSaveError = null; PSState.lastSave = { savefileId, at: Date.now() }; return r; }, (e: unknown) => { fail("write-failed", e); throw e; });
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
    return encodeContents(contents,snapshot);
  };
  // JsonEx mutates class envelopes while encoding. Clone the host first so previews do not add '@' to live objects.
  const detachHost = (value: any, active = new Set<any>()): any => {
    if (!value || typeof value !== "object") return value;
    if (active.has(value)) throw new Error("cyclic host save contents");
    active.add(value);
    const out = Array.isArray(value) ? [] : Object.create(Object.getPrototypeOf(value));
    for (const key of Object.keys(value)) {
      const d = Object.getOwnPropertyDescriptor(value,key)!;
      if (!Object.hasOwn(d,"value")) throw new Error("host save accessors are unsupported for migration");
      Object.defineProperty(out,key,{value:detachHost(d.value,active),enumerable:true,writable:true,configurable:true});
    }
    active.delete(value); return out;
  };
  const encodeContents = (contents: any, snapshot: any): any => {
    if (!contents?.system || typeof contents.system !== "object") throw new Error("state-unusable: save contents have no Game_System");
    const descriptors = Object.getOwnPropertyDescriptors(contents.system);
    descriptors._psGame = {value:{encoding,version:1,data:JSON.stringify(snapshot)},enumerable:true,configurable:true,writable:true};
    contents.system = Object.create(Object.getPrototypeOf(contents.system),descriptors);
    return contents;
  };
  const assertReplacement = (): void => {
    if (friendshipModal) throw new Error("friendship-preview-active: finish the migration choice before replacing host state");
    W.PSFlow?._app?.assertHostStateReplacementAllowed?.();
  };
  const hostIdentity = (): string => {
    const content = W.PSFlow.content(), prepared = schema().snapshotForSave(W.PSFlow.game(),content);
    if (!prepared.ok) throw new Error("invalid framework state for host migration capture");
    const contents = detachHost(encodeContents(baseMake.call(G.DataManager),prepared.state));
    delete contents.system._psSaveInfo; delete contents.system._psSaveWarning; delete contents.system._psSaveError;
    return nodeRequire("./js/engine/build/production.cjs").store.friendshipRawHash(G.JsonEx.stringify({contents,globalInfo:detachHost(G.DataManager._globalInfo)}));
  };
  const migrationPort = (slot: number, assertModal: () => void): any => {
    if (!Number.isSafeInteger(slot) || slot < 1 || slot > G.DataManager.maxSavefiles()) throw new Error("choose an existing manual save slot");
    if (!G.StorageManager.isLocalMode()) throw new Error("friendship migration requires a local desktop save");
    const B = nodeRequire("./js/engine/build/production.cjs");
    const file = G.StorageManager.filePath(G.DataManager.makeSavename(slot));
    const assertTarget = (): void => {
      assertModal();
      if (G.StorageManager.filePath(G.DataManager.makeSavename(slot)) !== file) throw new Error("friendship slot location changed");
    };
    const read = async (): Promise<any> => {
      assertTarget();
      const live = hostIdentity(), raw = B.store.readFriendshipBytes(file);
      const text = await G.StorageManager.zipToJson(raw.bytes.toString("utf8"));
      assertTarget();
      if (hostIdentity() !== live || B.store.readFriendshipBytes(file).rawHash !== raw.rawHash) throw new Error("friendship host or slot changed during preview");
      // Keep original host class envelopes as data; do not load or install them during a preview.
      const contents = JSON.parse(text);
      const migrated = schema().migrateGame(unpack(contents?.system?._psGame),{content:W.PSFlow.content(),speciesKey:W.PSFlow.speciesKeyResolver()});
      if (!migrated.ok) throw new Error("selected slot cannot be fully validated: "+migrated.error.message);
      return {target:raw.target,rawHash:raw.rawHash,sourceSchema:migrated.from,state:migrated.state,hostIdentity:live};
    };
    return {preview:read,commit:async (request: any): Promise<any> => {
      // All awaits precede the sync local commit; after each, recheck both application owner and whole host capture.
      const assertCurrent = (): void => {
        request.assertCurrent(); assertTarget();
        if (hostIdentity() !== request.before.hostIdentity) throw new Error("friendship-host-stale");
      };
      try {
        assertCurrent();
        const raw = B.store.readFriendshipBytes(file);
        if (raw.rawHash !== request.before.rawHash) throw new Error("friendship-slot-stale");
        const text = await G.StorageManager.zipToJson(raw.bytes.toString("utf8")); assertCurrent();
        const contents = JSON.parse(text), prepared = schema().snapshotForSave(request.next,W.PSFlow.content());
        if (!prepared.ok) throw new Error("friendship candidate failed complete validation");
        // Reuse the exact existing host payload; replace only the validated framework envelope.
        contents.system._psGame = {encoding,version:1,data:JSON.stringify(prepared.state)};
        const encoded = JSON.stringify(contents);
        // Actual host decoding must reconstruct the normal classes and the wrapped framework JSON before committing.
        const decoded = await G.StorageManager.jsonToObject(encoded); assertCurrent();
        const check = schema().snapshotForSave(unpack(decoded.system._psGame),W.PSFlow.content());
        if (!check.ok || JSON.stringify(check.state) !== JSON.stringify(prepared.state)) throw new Error("friendship host decoding mismatch");
        const zip = await G.StorageManager.jsonToZip(encoded); assertCurrent();
        const roundtrip = await G.StorageManager.zipToJson(zip); assertCurrent();
        if (roundtrip !== encoded) throw new Error("friendship compression mismatch");
        // StorageManager.fsWriteFile uses UTF-8 when zip is a string; preserve that exact actual on-disk encoding.
        const bytes = nodeRequire("node:buffer").Buffer.from(zip,"utf8");
        return B.store.commitFriendshipFile(file,raw.rawHash,bytes,{codec:"mz-jsonex-pokemon-framework-json-v1/utf8-zip",contentHash:request.contentHash,contentIdentity:request.contentIdentity,sourceSchema:request.before.sourceSchema,plan:request.plan,pure:request.receipt},assertCurrent);
      } catch(error) {return {status:"not-committed",error:String(error instanceof Error?error.message:error)};}
    }};
  };
  const previewMigration = async (slot: number, paths?: readonly string[], assertModal: () => void = () => {}): Promise<any> => {
    if (ordinaryWrites || ordinaryLoads) return {status:"refused",reason:"host-save-or-load-pending"};
    return W.PSFlow.app().previewFriendshipMigration(migrationPort(slot,assertModal),paths);
  };
  PSState.previewFriendshipMigration = (slot: number, paths?: readonly string[]): Promise<any> => {
    if (friendshipModal) return Promise.resolve({status:"refused",reason:"host-migration-choice-pending"});
    return previewMigration(slot,paths);
  };
  PSState.confirmFriendshipMigration = (handle: any): Promise<any> => W.PSFlow.app().confirmFriendshipMigration(handle);
  PSState.cancelFriendshipMigration = (handle: any): any => W.PSFlow.app().cancelFriendshipMigration(handle);
  // Recovery is explicit and hash guarded; never invoked by load/Continue. Reload after a complete/restore action.
  PSState.inspectFriendshipRecovery = (bundle: string): any => nodeRequire("./js/engine/build/production.cjs").store.inspectFriendshipRecovery(bundle);
  PSState.recoverFriendshipMigration = (bundle: string, action: "complete" | "restore-original"): any => {
    assertReplacement();
    if (W.PSFlow.operationPending()) throw new Error("operation-pending");
    const B = nodeRequire("./js/engine/build/production.cjs"), info = B.store.inspectFriendshipRecovery(bundle);
    const path = nodeRequire("node:path");
    if (path.dirname(info.target) !== path.resolve(G.StorageManager.fileDirectoryPath())) throw new Error("recovery target belongs to another save directory");
    const result = B.store.recoverFriendshipFile(bundle,action);
    G.$gameSystem._psSaveError = {code:"reload-required",message:"Explicit save recovery completed. Reload that slot before continuing."};
    return result;
  };
  const baseCreateObjects = G.DataManager.createGameObjects;
  if (baseCreateObjects) G.DataManager.createGameObjects = function(this: any) { assertReplacement(); return baseCreateObjects.call(this); };
  const baseSaveObject = G.StorageManager?.saveObject;
  if (baseSaveObject) G.StorageManager.saveObject = function(this: any, ...args: any[]) {
    assertReplacement(); ordinaryWrites++;
    try {return Promise.resolve(baseSaveObject.apply(this,args)).finally(()=>{ordinaryWrites--;});}
    catch(error) {ordinaryWrites--;throw error;}
  };
  const baseSaveZip = G.StorageManager?.saveZip;
  if (baseSaveZip) G.StorageManager.saveZip = function(this: any, ...args: any[]) {assertReplacement();return baseSaveZip.apply(this,args);};
  const baseLoadGame = G.DataManager.loadGame;
  if (baseLoadGame) G.DataManager.loadGame = function(this: any, slot: number) {
    assertReplacement(); ordinaryLoads++;
    try {return Promise.resolve(baseLoadGame.call(this,slot)).finally(()=>{ordinaryLoads--;});}
    catch(error) {ordinaryLoads--;throw error;}
  };
  const baseSetup = G.DataManager.setupNewGame;
  if (baseSetup) G.DataManager.setupNewGame = function(this: any, ...args: any[]) { assertReplacement(); return baseSetup.apply(this,args); };
  if (G.Scene_Map?.prototype.updateMain) {
    const updateMain = G.Scene_Map.prototype.updateMain;
    G.Scene_Map.prototype.updateMain = function(this: any, ...args: any[]) {
      if (friendshipModal && friendshipModal.scene === this) return;
      return updateMain.apply(this,args);
    };
    for (const method of ["stop","terminate"]) {
      const base = G.Scene_Map.prototype[method];
      if (base) G.Scene_Map.prototype[method] = function(this: any, ...args: any[]) {
        if (friendshipModal && friendshipModal.scene === this) friendshipModal.abort();
        return base.apply(this,args);
      };
    }
  }
  if (G.PluginManager?.registerCommand) G.PluginManager.registerCommand("PS_SaveState","MigrateFriendship",function(this: any,args: any) {
    if (this._psFriendshipMigrationPending || friendshipModal) throw new Error("friendship preview already open");
    const scene = G.SceneManager?._scene;
    if (G.Scene_Map && !(scene instanceof G.Scene_Map)) throw new Error("friendship migration command requires a map scene");
    let live = true, handle: any, choiceOpen = false;
    const release = () => { if (friendshipModal === operation) friendshipModal = null; this._psFriendshipMigrationPending = false; };
    const operation = {scene,abort: () => {
      live = false; release();
      if (choiceOpen) { G.$gameMessage.clear(); choiceOpen = false; }
      if (handle) { try { PSState.cancelFriendshipMigration(handle); } catch { /* A confirming owner retains its own fail-closed guard. */ } }
      PSState.lastMigration = {status:"refused",reason:"migration-scene-changed"};
    }};
    const assertModal = () => {
      if (!live || friendshipModal !== operation || G.SceneManager?._scene !== scene || G.SceneManager?.isSceneChanging?.()) throw new Error("friendship migration scene changed");
    };
    friendshipModal = operation;
    this._psFriendshipMigrationPending = true; this.setWaitMode("psFriendshipMigration");
    const finish = (result: any) => {
      const visible = live && G.SceneManager?._scene === scene && !G.SceneManager?.isSceneChanging?.();
      live = false; release(); PSState.lastMigration = result;
      if (!visible) return;
      G.$gameMessage.add(result.status === "applied" || result.status === "already-applied" ? "友好度迁移已保存。"
      : result.reason === "preview-completed" ? "此预览对应的迁移已经结束，无法取消。请重新预览所选存档以确认当前状态。"
      : result.status === "cancelled" ? "已取消此次预览，未执行迁移。"
      : result.status === "unchanged" ? "所选存档没有需要迁移的项目。"
      : result.status === "reload-required" ? (result.persistence?.status === "committed"
        ? "存档已写入，当前游戏状态未能核实。请停止操作，重新启动后载入该存档。"
        : "保存结果尚未核定。请停止操作，重新启动后检查该存档及保留的原档备份。")
      : "迁移未更改所选存档。请检查存档状态并重新预览。"); };
    // command357 still needs to advance its index and finish this frame's world update before capture.
    Promise.resolve().then(()=>{assertModal();return previewMigration(Number(args.slot),undefined,assertModal);}).then((p: any)=>{
      if (!live) { if (p.status === "ready") PSState.cancelFriendshipMigration(p.handle); return; }
      if (p.status !== "ready") {finish(p);return;}
      assertModal(); handle = p.handle;
      G.$gameMessage.add(`将存档 ${Number(args.slot)} 中选中的 ${p.targets.length} 项友好度从 256 改为 255。保留原档备份。其它超范围项 ${p.outOfScope.length} 项保持原值。`);
      G.$gameMessage.setChoices(["确认迁移并保存","取消"],1,1);
      G.$gameMessage.setChoiceCallback((choice: number)=>{
        if (!live) return;
        choiceOpen = false;
        // ChoiceList terminates its current message after calling us; publish the result afterwards.
        if (choice !== 0) {Promise.resolve().then(()=>PSState.cancelFriendshipMigration(p.handle)).then(finish,(e: unknown)=>finish({status:"refused",error:String(e)}));return;}
        PSState.confirmFriendshipMigration(p.handle).then(finish,(e: unknown)=>finish({status:"refused",error:String(e)}));
      });
      choiceOpen = true;
    }).catch((e: unknown)=>finish({status:"refused",error:String(e)}));
  });
  if (G.Game_Interpreter?.prototype.updateWaitMode) {
    const baseWait = G.Game_Interpreter.prototype.updateWaitMode;
    G.Game_Interpreter.prototype.updateWaitMode = function(this: any) {
      if (this._waitMode === "psFriendshipMigration") {if (this._psFriendshipMigrationPending || G.$gameMessage.isBusy?.()) return true;this._waitMode="";return false;}
      return baseWait.call(this);
    };
  }
})();
