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
import { applyBattleResult } from "../rules/state";
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

export class SaveStore {
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
    this._at("start");
    const info = this.loadInfo();
    const names = [...(result.captured || []).map((c) => c.species), ...(result.dex?.seen || []), ...(result.dex?.owned || [])];
    if (!this.speciesKey && names.length) throw new Error(`this result names species (${[...new Set(names)].slice(0, 3).join(", ")}) and the store was given no species mapping: pass the content's resolver (or identityKeys for a fixture world); nothing was written`);
    const r = applyBattleResult(info.state, result, undefined, this.speciesKey ?? (() => null), { ...options, ...(this.content ? { content: this.content } : {}) });
    if (info.migrated) { this._backup(info.from); this._at("afterBackup"); }
    if (r.status === "already-applied" && !info.migrated) return { status: r.status };
    this._at("beforeSave");
    this.save(r.state);
    return { status: r.status, ...(info.migrated ? { migratedFrom: info.from } : {}) };
  }
}
