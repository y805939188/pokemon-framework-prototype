/**
 * Explicit 256 -> 255 player preview/confirmation only. No save loader, host, clock, ledger or installation effects.
 * The small envelope/snapshot helpers are also used by the author-happiness companion, never by general migrations.
 */
import { sha256Hex } from "./sha256";

export type FriendshipMigrationKind = "player-friendship-256-to-255" | "author-happiness-256-to-255";
export interface FriendshipMigrationTarget { path: string; identity: string; before: 256; after: 255 }
export interface FriendshipMigrationExcluded { path: string; identity: string; value: number; reason: "outside-approved-256-migration" }
export interface FriendshipMigrationPlan {
  version: 1;
  kind: FriendshipMigrationKind;
  beforeSnapshot: string;
  afterSnapshot: string;
  beforeHash: string;
  afterHash: string;
  /** All exact-256 candidates, including those deliberately not selected. */
  candidates: FriendshipMigrationTarget[];
  targets: FriendshipMigrationTarget[];
  outOfScope: FriendshipMigrationExcluded[];
  planHash: string;
}
export interface FriendshipMigrationConfirmation { planHash: string; targetPaths: readonly string[] }
export interface FriendshipMigrationReceipt {
  version: 1;
  kind: FriendshipMigrationKind;
  planHash: string;
  beforeHash: string;
  afterHash: string;
  targets: FriendshipMigrationTarget[];
  /** Full original data, kept OUTSIDE the player state / author files. Persisting this is the caller's obligation. */
  originalSnapshot: string;
  afterSnapshot: string;
  receiptHash: string;
}
export interface FriendshipMigrationProblem { path: string; message: string }
export type FriendshipMigrationRefusal = {
  status: "refused";
  reason: "invalid-snapshot" | "invalid-input" | "invalid-selection" | "invalid-plan" | "confirmation-mismatch" | "stale-plan";
  problems: FriendshipMigrationProblem[];
};
export type FriendshipMigrationPreview = { status: "ready"; plan: FriendshipMigrationPlan } | FriendshipMigrationRefusal;
export type FriendshipMigrationApplied = {
  status: "applied" | "already-applied" | "unchanged";
  /** Detached document. Caller validates and installs it under its own application/storage transaction. */
  data: unknown;
  receipt: FriendshipMigrationReceipt;
} | FriendshipMigrationRefusal;

type Obj = Record<string, unknown>;
export const friendshipMigrationObject = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** Lossless for JSON documents. Reject unsupported values instead of silently dropping fields or running getters. */
export function friendshipMigrationSnapshot(input: unknown): string {
  const active = new Set<object>();
  const visit = (v: unknown, path: string): unknown => {
    if (v === null || typeof v === "boolean" || typeof v === "string") return v;
    if (typeof v === "number" && Number.isFinite(v) && !Object.is(v, -0)) return v;
    if (typeof v !== "object" || v === null) throw new Error(`${path}: must be losslessly representable JSON`);
    if (active.has(v)) throw new Error(`${path}: cyclic data`);
    const array = Array.isArray(v), proto: unknown = Object.getPrototypeOf(v);
    if (array ? proto !== Array.prototype : proto !== Object.prototype && proto !== null) throw new Error(`${path}: must be a plain JSON object or array`);
    const names = Object.getOwnPropertyNames(v);
    if (Object.getOwnPropertySymbols(v).length || names.some(k => {
      const d = Object.getOwnPropertyDescriptor(v, k)!;
      return !Object.hasOwn(d, "value") || (!d.enumerable && !(array && k === "length"));
    })) throw new Error(`${path}: accessors, symbols and hidden data are unsupported`);
    if (array && (names.length !== v.length + 1 || Array.from({length:v.length}, (_,i)=>i).some(i=>!Object.hasOwn(v,i)))) throw new Error(`${path}: sparse or extended arrays are unsupported`);
    active.add(v);
    const result: unknown = array ? v.map((x,i)=>visit(x,`${path}[${i}]`)) : Object.fromEntries(Object.keys(v).sort().map(k=>[k,visit((v as Obj)[k],`${path}.${k}`)]));
    active.delete(v);
    return result;
  };
  return JSON.stringify(visit(input, "$"));
}

export function friendshipMigrationRefusal(reason: FriendshipMigrationRefusal["reason"], path: string, message: string): FriendshipMigrationRefusal {
  return {status:"refused",reason,problems:[{path,message}]};
}

/** Seal this purpose-specific preview, including the complete snapshots, candidate set and exact selection. */
export function sealFriendshipMigration(
  kind: FriendshipMigrationKind, beforeSnapshot: string, afterSnapshot: string,
  candidates: FriendshipMigrationTarget[], targets: FriendshipMigrationTarget[], outOfScope: FriendshipMigrationExcluded[],
): FriendshipMigrationPlan {
  const body = {version:1 as const,kind,beforeSnapshot,afterSnapshot,beforeHash:sha256Hex(beforeSnapshot),afterHash:sha256Hex(afterSnapshot),candidates,targets,outOfScope};
  return {...body,planHash:sha256Hex(friendshipMigrationSnapshot(body))};
}

export function selectFriendshipMigrationTargets(candidates: FriendshipMigrationTarget[], selectedPaths?: readonly string[]): FriendshipMigrationTarget[] | FriendshipMigrationRefusal {
  if (selectedPaths === undefined) return [...candidates];
  if (!Array.isArray(selectedPaths) || Object.keys(selectedPaths).length !== selectedPaths.length || selectedPaths.some(p=>typeof p!=="string") || new Set(selectedPaths).size !== selectedPaths.length || selectedPaths.some(p=>!candidates.some(c=>c.path===p))) {
    return friendshipMigrationRefusal("invalid-selection","$.targetPaths","select unique exact-256 candidate paths from this preview");
  }
  return candidates.filter(c=>selectedPaths.includes(c.path));
}

/**
 * Recompute the entire preview from its original snapshot and selected paths before trusting any of its fields.
 * Confirmation must carry the hash shown in the preview, independently of the submitted plan. This is integrity
 * checking, not an authorization/security boundary; an actor able to replace both can request a different preview.
 */
export function confirmFriendshipMigration(
  kind: FriendshipMigrationKind, current: unknown, plan: unknown, confirmation: FriendshipMigrationConfirmation,
  preview: (input: unknown, paths?: readonly string[]) => FriendshipMigrationPreview,
): FriendshipMigrationApplied {
  try {
    plan = JSON.parse(friendshipMigrationSnapshot(plan)) as unknown;
    if (!friendshipMigrationObject(plan) || plan["kind"] !== kind || plan["version"] !== 1 || typeof plan["beforeSnapshot"] !== "string" || !Array.isArray(plan["targets"])) {
      return friendshipMigrationRefusal("invalid-plan","$","incomplete or unsupported friendship migration plan");
    }
    const paths = plan["targets"].map((t: unknown)=>friendshipMigrationObject(t)?t["path"]:undefined);
    if (paths.some(p=>typeof p!=="string")) return friendshipMigrationRefusal("invalid-plan","$.targets","every target needs its exact path");
    const rebuilt = preview(JSON.parse(plan["beforeSnapshot"]) as unknown, paths as string[]);
    if (rebuilt.status !== "ready" || friendshipMigrationSnapshot(rebuilt.plan) !== friendshipMigrationSnapshot(plan)) {
      return friendshipMigrationRefusal("invalid-plan","$","plan differs from the complete deterministic preview of its original snapshot");
    }
    const valid = rebuilt.plan;
    if (!confirmation || confirmation.planHash !== valid.planHash || friendshipMigrationSnapshot(confirmation.targetPaths) !== friendshipMigrationSnapshot(valid.targets.map(t=>t.path))) {
      return friendshipMigrationRefusal("confirmation-mismatch","$","confirm the exact preview hash and ordered selected paths");
    }
    const now = friendshipMigrationSnapshot(current);
    if (now !== valid.beforeSnapshot && now !== valid.afterSnapshot) return friendshipMigrationRefusal("stale-plan","$","current full snapshot differs from both the preview and its completed result");
    const body = {version:1 as const,kind,planHash:valid.planHash,beforeHash:valid.beforeHash,afterHash:valid.afterHash,targets:valid.targets,originalSnapshot:valid.beforeSnapshot,afterSnapshot:valid.afterSnapshot};
    const receipt = {...body,receiptHash:sha256Hex(friendshipMigrationSnapshot(body))};
    return {status:valid.beforeSnapshot===valid.afterSnapshot?"unchanged":now===valid.afterSnapshot?"already-applied":"applied",data:JSON.parse(valid.afterSnapshot) as unknown,receipt};
  } catch (error) {
    return friendshipMigrationRefusal("invalid-plan","$",error instanceof Error?error.message:String(error));
  }
}

/** JSON player snapshot with the existing party + storage.boxes[].slots topology; not a replacement save validator. */
export function planPlayerFriendshipMigration(input: unknown, selectedPaths?: readonly string[]): FriendshipMigrationPreview {
  let beforeSnapshot: string;
  try { beforeSnapshot=friendshipMigrationSnapshot(input); }
  catch(error) { return friendshipMigrationRefusal("invalid-snapshot","$",error instanceof Error?error.message:String(error)); }
  const data: unknown=JSON.parse(beforeSnapshot);
  if (!friendshipMigrationObject(data) || !Number.isSafeInteger(data["schema"]) || (data["schema"] as number)<1 || !Array.isArray(data["party"]) || !friendshipMigrationObject(data["storage"]) || !Array.isArray(data["storage"]["boxes"])) {
    return friendshipMigrationRefusal("invalid-input","$","requires an explicit player schema, party and storage.boxes");
  }
  const candidates: FriendshipMigrationTarget[]=[], outOfScope: FriendshipMigrationExcluded[]=[], problems: FriendshipMigrationProblem[]=[], ids=new Set<string>();
  const holders=new Map<string,Obj>();
  const member=(raw: unknown,path: string,location: string):void=>{
    if (!friendshipMigrationObject(raw) || typeof raw["id"]!=="string" || !raw["id"] || typeof raw["species"]!=="string" || !raw["species"] || (raw["form"]!==undefined && (!Number.isSafeInteger(raw["form"]) || (raw["form"] as number)<0))) {
      problems.push({path,message:"member needs an explicit id/species and a valid optional form"}); return;
    }
    if (ids.has(raw["id"])) {problems.push({path:`${path}.id`,message:"duplicate member identity"});return;}
    ids.add(raw["id"]);
    const value=raw["friendship"],identity=`${location}: member ${raw["id"]}, species ${raw["species"]}, form ${String(raw["form"]??0)}`;
    if (value===undefined) return; // Never materialize the gameplay fallback of 70.
    if (typeof value!=="number" || !Number.isSafeInteger(value) || value<0) {problems.push({path:`${path}.friendship`,message:"must be a nonnegative safe integer; this migration only changes exact 256"});return;}
    if (value===256) {const target={path:`${path}.friendship`,identity,before:256 as const,after:255 as const};candidates.push(target);holders.set(target.path,raw);}
    else if (value>255) outOfScope.push({path:`${path}.friendship`,identity,value,reason:"outside-approved-256-migration"});
  };
  data["party"].forEach((m:unknown,i:number)=>member(m,`$.party[${i}]`,`party ${i}`));
  data["storage"]["boxes"].forEach((box:unknown,b:number)=>{
    if(!friendshipMigrationObject(box)||!Array.isArray(box["slots"])) {problems.push({path:`$.storage.boxes[${b}]`,message:"box needs explicit slots"});return;}
    box["slots"].forEach((m:unknown,s:number)=>{if(m!==null)member(m,`$.storage.boxes[${b}].slots[${s}]`,`box ${b} (${String(box["name"]??"")}), slot ${s}`);});
  });
  if(problems.length)return {status:"refused",reason:"invalid-input",problems};
  const targets=selectFriendshipMigrationTargets(candidates,selectedPaths);
  if(!Array.isArray(targets))return targets;
  for(const target of targets)holders.get(target.path)!["friendship"]=255;
  return {status:"ready",plan:sealFriendshipMigration("player-friendship-256-to-255",beforeSnapshot,friendshipMigrationSnapshot(data),candidates,targets,outOfScope)};
}

export function applyPlayerFriendshipMigration(current: unknown, plan: unknown, confirmation: FriendshipMigrationConfirmation): FriendshipMigrationApplied {
  return confirmFriendshipMigration("player-friendship-256-to-255",current,plan,confirmation,planPlayerFriendshipMigration);
}
