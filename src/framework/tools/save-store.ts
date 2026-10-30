import { commitFriendshipFile, readFriendshipBytes, friendshipRawHash } from "./friendship-file";
import type { FriendshipFilePoint } from "./friendship-file";
import type { FriendshipPersistencePort, FriendshipPersistenceRequest, FriendshipPersistenceResult, FriendshipPersistenceSnapshot } from "../app/friendship-migration-operation";
import { friendshipMigrationSnapshot } from "../rules/friendship-migration";
export { inspectFriendshipRecovery, recoverFriendshipFile } from "./friendship-file";
export type { FriendshipFilePoint } from "./friendship-file";
/**
 * Durable single-file store for headless runs and tests: one JSON document replaced atomically (write temp, fsync,
 * rename). Reading goes through the schema migration; a document that cannot be understood (damaged, newer, invalid)
 * raises a SaveError and the file is NEVER overwritten or cleared. When a legacy document is upgraded, the original is
 * first kept next to it as `<file>.v<from>.bak`.
 *
 * What is claimed (and tested): a throw, or a real process kill, at any point of commit() leaves either the complete
 * old file or the complete new file (both readable), a leftover temp file is discarded on load, and a re-submitted
 * result is applied at most once. Not claimed: power loss beyond fsync+rename, multi-file saves, battle-in-progress
 * saves. Node-only (uses fs); the MZ runtime saves through MZ's own save files (see the PS_SaveState plugin).
 *
 * Species keys (D5-3): the store knows no content. Give it the content's mapping (`speciesKeyResolver(content)`), or,
 * for a fixture world whose content ids are the Showdown names, choose `identityKeys` explicitly. Without one, a
 * document older than schema 4 is refused ("needs-content", the file untouched) and a result that names a species
 * (a capture, the dex) is refused: nothing is guessed.
 */
import fs from "node:fs";
import { applyBattleResult, resultHash } from "../rules/state";
import { assertBattleResultShape } from "../rules/battle-result-validation";
import type { BattleCommitOptions, BattleResult, GameState } from "../rules/state";
import type { Content } from "../rules/types";
import { migrateGame, snapshotForSave } from "../rules/save-schema";
import { GAME_SCHEMA } from "../rules/state";
import type { MigrationResult, SaveErrorInfo } from "../rules/save-schema";
import type { SpeciesKeyResolver } from "../rules/species-key";

export type FaultPoint = "start" | "afterBackup" | "beforeSave" | "afterTmpWrite" | "beforeRename" | "afterRename";

/** A save that must not be touched: the diagnostic travels with the error. */
export class SaveError extends Error {
  info: SaveErrorInfo;
  constructor(info: SaveErrorInfo) {
    super(`${info.code}: ${info.message}`);
    this.name = "SaveError";
    this.info = info;
  }
}

export type LoadInfo = Extract<MigrationResult, { ok: true }>;
const LEGACY_PRODUCERS = new WeakMap<object, (battleId: string) => BattleResult>();

/** Explicit old no-held composition root. A normal store never infers fresh battle authority from caller JSON. */
export function createLegacyNoHeldSaveStore(file: string, producer: (battleId: string) => BattleResult, hooks: { at?: (point: FaultPoint) => void } = {}, speciesKey?: SpeciesKeyResolver, content?: Content): SaveStore {
  const store = new SaveStore(file, hooks, speciesKey, content);
  LEGACY_PRODUCERS.set(store, producer);
  return store;
}

export class SaveStore {
  private committing = false;
  file: string;
  hooks: { at?: (point: FaultPoint) => void };
  /** Showdown name -> persistent key for older documents and results (D5-3); none = refuse instead of guessing. */
  speciesKey: SpeciesKeyResolver | undefined;
  content: Content | undefined;

  constructor(file: string, hooks: { at?: (point: FaultPoint) => void } = {}, speciesKey?: SpeciesKeyResolver, content?: Content) {
    this.file = file;
    this.hooks = hooks; // test-only fault injection: hooks.at(point) may throw or exit the process
    this.speciesKey = speciesKey;
    this.content = content;
  }
  /** Explicit adapter for GameApplication.previewFriendshipMigration; preview never cleans temp files or writes. */
  friendshipMigration(at: (point: FriendshipFilePoint) => void = () => {}): FriendshipPersistencePort {
    const originalFile = this.file, originalContent = this.content;
    const capture = (): FriendshipPersistenceSnapshot => {
      if (this.file !== originalFile || this.content !== originalContent || !originalContent) throw Error("friendship-store-target-or-content-changed");
      const raw = readFriendshipBytes(originalFile);
      const migrated = migrateGame(JSON.parse(Buffer.from(raw.bytes).toString("utf8")) as unknown,{...(this.speciesKey?{speciesKey:this.speciesKey}:{}),content:originalContent});
      if (!migrated.ok) throw new SaveError(migrated.error);
      const prepared = snapshotForSave(migrated.state,originalContent);
      if (!prepared.ok) throw Error("friendship-store-state-invalid");
      return {target:raw.target,rawHash:raw.rawHash,sourceSchema:migrated.from,state:prepared.state,hostIdentity:"single-json-file"};
    };
    return {
      preview: async () => { if (this.committing) throw Error("store-commit-active"); return capture(); },
      commit: async (request: FriendshipPersistenceRequest): Promise<FriendshipPersistenceResult> => {
        if (this.committing) return {status:"not-committed",error:"store-commit-active"};
        this.committing = true;
        try {
          request.assertCurrent();
          if (friendshipMigrationSnapshot(capture()) !== friendshipMigrationSnapshot(request.before)) return {status:"not-committed",error:"friendship-store-stale"};
          const prepared = snapshotForSave(request.next,originalContent!);
          if (!prepared.ok || friendshipMigrationSnapshot(prepared.state) !== request.plan.afterSnapshot) return {status:"not-committed",error:"friendship-candidate-invalid"};
          const next = Buffer.from(JSON.stringify(prepared.state),"utf8");
          return commitFriendshipFile(originalFile,request.before.rawHash,next,{codec:"framework-json",contentHash:request.contentHash,contentIdentity:request.contentIdentity,sourceSchema:request.before.sourceSchema,plan:request.plan,pure:request.receipt},()=>{
            request.assertCurrent();
            if (this.file !== originalFile || this.content !== originalContent || friendshipRawHash(fs.readFileSync(originalFile)) !== request.before.rawHash) throw Error("friendship-store-stale");
          },at);
        } catch (error) { return {status:"not-committed",error:error instanceof Error?error.message:String(error)}; }
        finally { this.committing = false; }
      },
    };
  }
  private _at(point: FaultPoint): void { this.hooks.at?.(point); }

  /** Read and migrate in memory; writes nothing. */
  loadInfo(): LoadInfo {
    // A leftover temp file is an interrupted commit: the committed file is authoritative.
    try { fs.unlinkSync(this.file + ".tmp"); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
    let raw: unknown;
    try { raw = JSON.parse(fs.readFileSync(this.file, "utf8")); }
    catch (e) { throw new SaveError({ code: "corrupt", message: `cannot read the save file as JSON (${(e as Error).message.slice(0, 120)}); the file was left untouched` }); }
    const r = migrateGame(raw, { ...(this.speciesKey ? { speciesKey: this.speciesKey } : {}), ...(this.content ? { content: this.content } : {}) });
    if (!r.ok) throw new SaveError(r.error);
    return r;
  }

  load(): GameState { return this.loadInfo().state; }

  save(state: GameState): void {
    if (this.committing) throw new Error("store-commit-active");
    this.savePrepared(state);
  }
  private savePrepared(state: GameState): void {
    const version = state && typeof state === "object" ? Object.getOwnPropertyDescriptor(state, "schema") : undefined;
    if (version && "value" in version && version.value !== GAME_SCHEMA) throw new SaveError({ code: "invalid", message: "save requires a current state; migrate explicitly before saving; original file untouched" });
    if (!this.content) throw new SaveError({code: "needs-content", message: "saving requires validated content; no file was written"});
    const prepared = snapshotForSave(state, this.content);
    if (!prepared.ok) throw new SaveError({code: "invalid", message: `save refused before writing: ${prepared.problems[0]!.path} ${prepared.problems[0]!.message}`, problems: prepared.problems});
    const tmp = this.file + ".tmp";
    const fd = fs.openSync(tmp, "w");
    try {
      fs.writeSync(fd, JSON.stringify(prepared.state));
      this._at("afterTmpWrite");
      fs.fsyncSync(fd);
    } finally { fs.closeSync(fd); }
    this._at("beforeRename");
    fs.renameSync(tmp, this.file);
    this._at("afterRename");
  }

  /** Keep the original bytes of a legacy file before its first upgrade (atomic: copy to temp, rename). */
  private _backup(from: number): void {
    const bak = `${this.file}.v${from}.bak`;
    if (fs.existsSync(bak)) return;
    fs.copyFileSync(this.file, bak + ".tmp");
    fs.renameSync(bak + ".tmp", bak);
  }

  /** Apply a battle result durably and idempotently. Returns {status}. */
  commit(result: BattleResult, options: BattleCommitOptions = {}): { status: "applied" | "already-applied"; migratedFrom?: number } {
    if (this.committing) throw new Error("store-commit-active");
    this.committing = true;
    try { return this.commitOwned(result, options); }
    finally { this.committing = false; }
  }
  private commitOwned(result: BattleResult, options: BattleCommitOptions): { status: "applied" | "already-applied"; migratedFrom?: number } {
    this._at("start");
    const info = this.loadInfo();
    assertBattleResultShape(result);
    // Producer callbacks can retain aliases to caller data. Authenticate and plan one private value,
    // never two aliases that a callback can change together between the source gate and hash check.
    result = structuredClone(result);
    const inputHash = resultHash(result), keys = this.speciesKey;
    let ownedOptions: BattleCommitOptions = {};
    const originalFile = this.file, originalBytes = fs.readFileSync(originalFile, "utf8");
    const previous = Object.hasOwn(info.state.appliedBattles, result.battleId) ? info.state.appliedBattles[result.battleId] : undefined;
    if (!previous) {
      const producer = LEGACY_PRODUCERS.get(this);
      if (!producer) throw new Error("store-battle-source-unknown: use the application for required settlement and save its complete candidate state");
      const inputTemplates = options.templates ?? {}, templates = structuredClone(inputTemplates);
      ownedOptions = structuredClone({ ...options, heldItemSource: undefined, templates,
        ...(this.content ? { content: this.content } : {}) });
      const templatesJSON = JSON.stringify(templates);
      if (info.state.party.some(m => !!m.item) || result.captured.some(m => !!m.item)
        || result.captured.some(m => !!templates[m.id]?.item)) throw new Error("legacy-no-held-store-source-gate");
      const actual = producer(result.battleId); assertBattleResultShape(actual);
      if (actual.captured.some(m => !!m.item) || actual.captured.some(m => !!inputTemplates[m.id]?.item)) throw new Error("legacy-no-held-store-source-gate");
      if (resultHash(actual) !== inputHash || JSON.stringify(inputTemplates) !== templatesJSON) throw new Error("legacy-store-producer-result-mismatch");
      if (this.file !== originalFile || fs.readFileSync(originalFile, "utf8") !== originalBytes) throw new Error("store-state-changed-during-producer");
    }
    const names = [...(result.captured || []).map((c) => c.species), ...(result.dex?.seen || []), ...(result.dex?.owned || [])];
    if (!keys && names.length) throw new Error(`this result names species (${[...new Set(names)].slice(0, 3).join(", ")}) and the store was given no species mapping: pass the content's resolver (or identityKeys for a fixture world); nothing was written`);
    const r = applyBattleResult(info.state, result, undefined, keys ?? (() => null), { ...ownedOptions, heldItemSource: { allowed: false, describe: () => null } });
    if (info.migrated) { this._backup(info.from); this._at("afterBackup"); }
    if (r.status === "already-applied" && !info.migrated) return { status: r.status };
    this._at("beforeSave");
    if (this.file !== originalFile || fs.readFileSync(originalFile, "utf8") !== originalBytes) throw new Error("store-state-changed-before-install");
    this.savePrepared(r.state);
    return { status: r.status, ...(info.migrated ? { migratedFrom: info.from } : {}) };
  }
}

export { commitFriendshipFile, readFriendshipBytes, friendshipRawHash } from "./friendship-file";
