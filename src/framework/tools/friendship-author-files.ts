/** Explicit author-directory migration into a NEW output. The source is read only, with byte-exact originals. */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { planAuthorFriendshipMigration, applyAuthorFriendshipMigration } from "../content/friendship-migration";
import { friendshipMigrationSnapshot } from "../rules/friendship-migration";
import type { ContentInputs } from "../content/schema";
const hash = (v: Uint8Array | string): string => createHash("sha256").update(v).digest("hex");
function exists(file: string): boolean {
  try {fs.lstatSync(file);return true;} catch(error) {if((error as NodeJS.ErrnoException).code === "ENOENT")return false;throw error;}
}
function originalFiles(src: string): Map<string, Buffer> {
  if (path.resolve(src) !== fs.realpathSync(src)) throw Error("author-source-alias");
  const out = new Map<string,Buffer>();
  const walk = (dir: string): void => {
    for (const e of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
      const file = path.join(dir,e.name);
      if (e.isSymbolicLink() || (!e.isDirectory() && !e.isFile())) throw Error("author-source-unsupported-entry");
      if (e.isDirectory()) walk(file); else out.set(path.relative(src,file),fs.readFileSync(file));
    }
  }; walk(src); return out;
}
export function migrateFriendshipAuthorFiles(src: string, out: string | undefined, confirmation: string | undefined, schema: 1 | 2,
  readInputs: (src: string) => ContentInputs, validate: (inputs: ContentInputs) => void): unknown {
  const original = originalFiles(src), inputs = readInputs(src), preview = planAuthorFriendshipMigration(inputs);
  if (preview.status !== "ready") throw Error(JSON.stringify(preview));
  const raw = [...original].map(([file,bytes])=>({file,sha256:hash(bytes)}));
  const body = {version:1,kind:"author-directory-friendship-256-to-255",source:path.resolve(src),schema,raw,plan:preview.plan};
  const previewHash = hash(friendshipMigrationSnapshot(body));
  if (!confirmation) return {status:"preview",...body,previewHash,writePerformed:false};
  if (!out || confirmation !== previewHash) throw Error("author-confirmation-mismatch");
  const target = path.resolve(out), source = path.resolve(src), parent = path.dirname(target);
  const nested = (a: string,b: string): boolean => a === b || b.startsWith(a + path.sep);
  if (nested(source,target) || nested(target,source) || exists(target) || fs.realpathSync(parent) !== parent) throw Error("author-output-must-be-new-independent-directory");
  const applied = applyAuthorFriendshipMigration(inputs,preview.plan,{planHash:preview.plan.planHash,targetPaths:preview.plan.targets.map(t=>t.path)});
  if (applied.status === "refused") throw Error(JSON.stringify(applied));
  const next = applied.data as ContentInputs;
  (next.manifest as {schema:number}).schema = schema;
  validate(next); // Entire standard domain, sources and assembled content, before creating anything.
  if (original.has("friendship-receipt.json") || [...original.keys()].some(f=>f.split(path.sep)[0] === ".friendship-original")) throw Error("author-source-reserved-output-name");
  const stage = fs.mkdtempSync(path.join(parent,".friendship-author-prepared-"));
  const write = (name: string,bytes: Uint8Array | string): void => {
    const file = path.join(stage,name); fs.mkdirSync(path.dirname(file),{recursive:true});
    const fd = fs.openSync(file,"wx",0o600); try {fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);} finally {fs.closeSync(fd);}
  };
  for (const [name,bytes] of original) {
    write(path.join(".friendship-original",name),bytes);
    const key = name.replace(/-([a-z])/g,(_,x:string)=>x.toUpperCase()).replace(/\.json$/,"") as keyof ContentInputs;
    const replaced = ["manifest.json","species.json","overlays.json"].includes(name);
    write(name,replaced ? JSON.stringify(next[key],null,2)+"\n" : bytes);
  }
  const receipt = {version:1,previewHash,source,target,raw,pure:applied.receipt,outputSchema:schema,
    output:[...original.keys()].map(file=>({file,sha256:hash(fs.readFileSync(path.join(stage,file)))}))};
  write("friendship-receipt.json",friendshipMigrationSnapshot({...receipt,receiptHash:hash(friendshipMigrationSnapshot(receipt))})+"\n");
  // The source may have changed during validation/copying: no mixed-time snapshot may be published.
  const now = [...originalFiles(src)].map(([file,bytes])=>({file,sha256:hash(bytes)}));
  if (friendshipMigrationSnapshot(now) !== friendshipMigrationSnapshot(raw) || exists(target)) throw Error("author-source-or-target-stale");
  const fd = fs.openSync(stage,"r");try {fs.fsyncSync(fd);} finally {fs.closeSync(fd);}
  fs.renameSync(stage,target); // ONE publication point; source untouched, complete originals and receipt already ready.
  return {status:"written",target,previewHash,receipt:path.join(target,"friendship-receipt.json")};
}
