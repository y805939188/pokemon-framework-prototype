/** Purpose-specific local byte preservation for explicit friendship migration. Not a multi-file transaction API.
 * A complete immutable prepared directory precedes the ONE target-file rename. Recovery never guesses or overwrites
 * unknown bytes. Process interruption is covered; power-loss durability across arbitrary filesystems is not claimed.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { applyPlayerFriendshipMigration, friendshipMigrationSnapshot } from "../rules/friendship-migration";
import type { FriendshipMigrationPlan, FriendshipMigrationReceipt } from "../rules/friendship-migration";
import type { FriendshipPersistenceResult } from "../app/friendship-migration-operation";

export type FriendshipFilePoint = "prepared" | "backup" | "candidate" | "receipt" | "bundle-ready" | "temp" | "before-rename" | "after-rename";
export interface FriendshipFileMetadata {
  codec: string;
  contentHash: string;
  contentIdentity: string | null;
  sourceSchema: number;
  plan: FriendshipMigrationPlan;
  pure: FriendshipMigrationReceipt;
}
interface ByteReceipt extends FriendshipFileMetadata {
  version: 1;
  target: string;
  beforeRawHash: string;
  afterRawHash: string;
  id: string;
}
export const friendshipRawHash = (bytes: Uint8Array | string): string => createHash("sha256").update(bytes).digest("hex");
export function readFriendshipBytes(file: string): { target: string; bytes: Uint8Array; rawHash: string } {
  const target = path.resolve(file);
  if (fs.realpathSync(target) !== target || !fs.lstatSync(target).isFile()) throw Error("friendship-target-alias-or-not-file");
  const bytes = fs.readFileSync(target);
  return {target, bytes, rawHash: friendshipRawHash(bytes)};
}
function syncWrite(file: string, bytes: Uint8Array | string): void {
  const fd = fs.openSync(file, "wx", 0o600);
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}
function syncDir(dir: string): void {
  const fd = fs.openSync(dir, "r"); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}
function validatedBundle(bundle: string): { receipt: ByteReceipt; original: Buffer; next: Buffer } {
  if (fs.realpathSync(bundle) !== path.resolve(bundle)) throw Error("friendship-bundle-alias");
  const receipt = JSON.parse(fs.readFileSync(path.join(bundle, "receipt.json"), "utf8")) as ByteReceipt;
  const { id, ...body } = receipt;
  if (receipt.version !== 1 || !/^[a-f0-9]{64}$/.test(id) || friendshipRawHash(friendshipMigrationSnapshot(body)) !== id) throw Error("friendship-receipt-invalid");
  const original = fs.readFileSync(path.join(bundle, "original.raw")), next = fs.readFileSync(path.join(bundle, "candidate.raw"));
  if (friendshipRawHash(original) !== receipt.beforeRawHash || friendshipRawHash(next) !== receipt.afterRawHash) throw Error("friendship-backup-hash-mismatch");
  const pure = applyPlayerFriendshipMigration(JSON.parse(receipt.plan.beforeSnapshot), receipt.plan, {planHash:receipt.plan.planHash,targetPaths:receipt.plan.targets.map(t=>t.path)});
  if (pure.status === "refused" || friendshipMigrationSnapshot(pure.receipt) !== friendshipMigrationSnapshot(receipt.pure)) throw Error("friendship-pure-receipt-invalid");
  const expected = path.join(receipt.target + ".friendship", id);
  if (path.resolve(bundle) !== expected) throw Error("friendship-bundle-target-mismatch");
  return {receipt,original,next};
}
export function inspectFriendshipRecovery(bundle: string): { status: "old" | "new" | "unknown"; target: string; receipt: ByteReceipt; error?: string } {
  const {receipt} = validatedBundle(bundle);
  let actual: string;
  try {actual = readFriendshipBytes(receipt.target).rawHash;} catch(error) {return {status:"unknown",target:receipt.target,receipt,error:error instanceof Error?error.message:String(error)};}
  return {status: actual === receipt.afterRawHash ? "new" : actual === receipt.beforeRawHash ? "old" : "unknown",target:receipt.target,receipt};
}
/** Explicit recovery only. 'restore-original' is permitted only when the actual file is the verified new version.
 * Original and receipt remain available after restoration. Unknown contents are never changed. */
export function recoverFriendshipFile(bundle: string, action: "inspect" | "complete" | "restore-original" = "inspect"): ReturnType<typeof inspectFriendshipRecovery> {
  const data = validatedBundle(bundle), current = inspectFriendshipRecovery(bundle);
  if (action === "inspect" || current.status === "unknown") return current;
  if (action !== "complete" && action !== "restore-original") throw Error("friendship-recovery-action-invalid");
  const desired = action === "complete" ? "new" : "old";
  if (current.status === desired) return current;
  const temp = data.receipt.target + ".friendship-recovery.tmp";
  if (fs.existsSync(temp)) {
    if (!fs.readFileSync(temp).equals(action === "complete" ? data.next : data.original)) throw Error("friendship-recovery-temp-unknown");
    fs.unlinkSync(temp);
  }
  syncWrite(temp, action === "complete" ? data.next : data.original);
  if (inspectFriendshipRecovery(bundle).status !== current.status) throw Error("friendship-recovery-stale");
  try {fs.renameSync(temp, data.receipt.target);syncDir(path.dirname(data.receipt.target));}
  catch(error) {return {...inspectFriendshipRecovery(bundle),error:error instanceof Error?error.message:String(error)};}
  return inspectFriendshipRecovery(bundle);
}
export function commitFriendshipFile(file: string, beforeRawHash: string, next: Uint8Array, meta: FriendshipFileMetadata,
  assertCurrent: () => void, at: (point: FriendshipFilePoint) => void = () => {}): FriendshipPersistenceResult {
  let bundle: string | undefined;
  try {
    const original = readFriendshipBytes(file);
    if (original.rawHash !== beforeRawHash) throw Error("friendship-file-stale");
    const body = {version:1 as const,target:original.target,beforeRawHash,afterRawHash:friendshipRawHash(next),...meta};
    const id = friendshipRawHash(friendshipMigrationSnapshot(body)), receipt = {...body,id};
    const parent = original.target + ".friendship";
    fs.mkdirSync(parent, {recursive:true,mode:0o700});
    if (fs.realpathSync(parent) !== parent) throw Error("friendship-backup-directory-alias");
    bundle = path.join(parent,id);
    if (!fs.existsSync(bundle)) {
      const stage = fs.mkdtempSync(path.join(parent,"preparing-")); at("prepared");
      syncWrite(path.join(stage,"original.raw"),original.bytes); at("backup");
      syncWrite(path.join(stage,"candidate.raw"),next); at("candidate");
      syncWrite(path.join(stage,"receipt.json"),friendshipMigrationSnapshot(receipt)+"\n"); at("receipt");
      syncDir(stage); fs.renameSync(stage,bundle); syncDir(parent);
    }
    validatedBundle(bundle); at("bundle-ready");
    const temp = original.target + `.friendship-${id}.tmp`;
    if (fs.existsSync(temp)) {
      if (!fs.readFileSync(temp).equals(next)) throw Error("friendship-temp-unknown");
      fs.unlinkSync(temp);
    }
    syncWrite(temp,next); at("temp");
    assertCurrent(); at("before-rename"); assertCurrent();
    if (readFriendshipBytes(original.target).rawHash !== beforeRawHash) throw Error("friendship-file-stale");
    fs.renameSync(temp,original.target); // THE durable target commit point; everything needed to recover already exists.
    at("after-rename"); syncDir(path.dirname(original.target));
    if (inspectFriendshipRecovery(bundle).status !== "new") throw Error("friendship-write-readback-mismatch");
    return {status:"committed",rawHash:body.afterRawHash,bundle};
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // A throw after rename is not a zero-write failure. Never roll back an unrecognized file.
    try {
      const actual = readFriendshipBytes(file).rawHash;
      if (bundle && fs.existsSync(bundle)) {
        const inspection = inspectFriendshipRecovery(bundle);
        return {status:inspection.status === "new" ? "committed" : inspection.status === "old" ? "not-committed" : "unknown",rawHash:actual,bundle,error:message};
      }
      return {status:actual === beforeRawHash ? "not-committed" : "unknown",rawHash:actual,error:message};
    } catch { return {status:"unknown",...(bundle?{bundle}:{}),error:message}; }
  }
}
