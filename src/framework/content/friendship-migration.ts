/** Explicit author happiness migration. Does not write files, upgrade the manifest, or migrate compiled/runtime data. */
import { compileContent } from "./compile";
import type { ContentInputs } from "./schema";
import {
  friendshipMigrationObject as isObj, friendshipMigrationSnapshot, friendshipMigrationRefusal,
  selectFriendshipMigrationTargets, sealFriendshipMigration, confirmFriendshipMigration,
} from "../rules/friendship-migration";
import type {
  FriendshipMigrationTarget, FriendshipMigrationExcluded, FriendshipMigrationPreview, FriendshipMigrationApplied, FriendshipMigrationConfirmation,
} from "../rules/friendship-migration";

export function planAuthorFriendshipMigration(input: unknown, selectedPaths?: readonly string[]): FriendshipMigrationPreview {
  let beforeSnapshot: string;
  try { beforeSnapshot=friendshipMigrationSnapshot(input); }
  catch(error) {return friendshipMigrationRefusal("invalid-snapshot","$",error instanceof Error?error.message:String(error));}
  const data: unknown=JSON.parse(beforeSnapshot);
  if(!isObj(data))return friendshipMigrationRefusal("invalid-input","$","requires author content inputs");
  // Full normal author validation, including source gate, form identities, overlays and legacy-version selection.
  const checked=compileContent(data as unknown as ContentInputs);
  if(!checked.ok)return {status:"refused",reason:"invalid-input",problems:checked.errors.map(e=>({path:`${e.file} ${e.path}`,message:e.message}))};
  const candidates: FriendshipMigrationTarget[]=[],outOfScope: FriendshipMigrationExcluded[]=[],holders=new Map<string,Record<string,unknown>>();
  const field=(holder:Record<string,unknown>,path:string,identity:string):void=>{
    const value=holder["happiness"];
    if(value===256){candidates.push({path,identity,before:256,after:255});holders.set(path,holder);}
    else if(typeof value==="number"&&value>255)outOfScope.push({path,identity,value,reason:"outside-approved-256-migration"});
  };
  (data["species"] as Record<string,unknown>[]).forEach((s,i)=>field(s,`species.json [${i}].happiness`,`species/${String(s["id"])}/${String(s["form"]??0)}`));
  (data["overlays"] as Record<string,unknown>[]).forEach((o,i)=>field(o["set"] as Record<string,unknown>,`overlays.json [${i}].set.happiness`,`overlay ${i} on ${String(o["target"])}`));
  const targets=selectFriendshipMigrationTargets(candidates,selectedPaths);
  if(!Array.isArray(targets))return targets;
  for(const target of targets)holders.get(target.path)!["happiness"]=255;
  return {status:"ready",plan:sealFriendshipMigration("author-happiness-256-to-255",beforeSnapshot,friendshipMigrationSnapshot(data),candidates,targets,outOfScope)};
}

export function applyAuthorFriendshipMigration(current: unknown, plan: unknown, confirmation: FriendshipMigrationConfirmation): FriendshipMigrationApplied {
  return confirmFriendshipMigration("author-happiness-256-to-255",current,plan,confirmation,planAuthorFriendshipMigration);
}
