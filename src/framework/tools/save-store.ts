/**
 * Minimal durable store for headless tests: one JSON file replaced atomically (write temp, fsync, rename).
 * Atomicity claim is limited to what is implemented and tested here: a crash/throw at any point of
 * commit() leaves either the complete old file or the complete new file, and a re-submitted result
 * is applied at most once (appliedBattles). No claim about power loss beyond fsync+rename semantics.
 * Node-only (uses fs): the MZ runtime saves through MZ's own save files, not through this class.
 */
import fs from "node:fs";
import { applyBattleResult } from "../rules/state.ts";
import type { BattleResult, GameState } from "../rules/state.ts";

export type FaultPoint = "start" | "beforeSave" | "afterTmpWrite" | "beforeRename" | "afterRename";

export class SaveStore {
  file: string;
  hooks: { at?: (point: FaultPoint) => void };

  constructor(file: string, hooks: { at?: (point: FaultPoint) => void } = {}) {
    this.file = file;
    this.hooks = hooks; // test-only fault injection: hooks.at(point) may throw or exit the process
  }
  private _at(point: FaultPoint): void { this.hooks.at?.(point); }

  load(): GameState {
    // A leftover temp file is an interrupted commit: the committed file is authoritative.
    try { fs.unlinkSync(this.file + ".tmp"); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
    return JSON.parse(fs.readFileSync(this.file, "utf8")) as GameState;
  }

  save(state: GameState): void {
    const tmp = this.file + ".tmp";
    const fd = fs.openSync(tmp, "w");
    try {
      fs.writeSync(fd, JSON.stringify(state));
      this._at("afterTmpWrite");
      fs.fsyncSync(fd);
    } finally { fs.closeSync(fd); }
    this._at("beforeRename");
    fs.renameSync(tmp, this.file);
    this._at("afterRename");
  }

  /** Apply a battle result durably and idempotently. Returns {status}. */
  commit(result: BattleResult): { status: "applied" | "already-applied" } {
    this._at("start");
    const state = this.load();
    const r = applyBattleResult(state, result);
    if (r.status === "already-applied") return { status: r.status };
    this._at("beforeSave");
    this.save(r.state);
    return { status: r.status };
  }
}
