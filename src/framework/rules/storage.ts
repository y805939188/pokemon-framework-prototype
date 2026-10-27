/** Fixed WP25 storage. These helpers never compact box slots or expose a second writable member list. */
import type { Member } from "./types";

export const BOX_COUNT = 40;
export const SLOTS_PER_BOX = 30;
export const STORAGE_CAPACITY = BOX_COUNT * SLOTS_PER_BOX;
export const BASIC_WALLPAPERS = Array.from({ length: 16 }, (_, i) => i);
export const SPECIAL_WALLPAPERS = Array.from({ length: 24 }, (_, i) => i + 16);

export interface StorageBox { name: string; wallpaper: number; slots: (Member | null)[] }
export interface Storage { currentBox: number; boxes: StorageBox[]; unlockedWallpapers: number[] }
export interface MemberCollection { party: Member[]; storage: Storage }
export type MemberPosition = { kind: "party"; index: number } | { kind: "box"; box: number; slot: number };
export interface MemberLocation { member: Member; position: MemberPosition }

export function newStorage(): Storage {
  return { currentBox: 0, boxes: Array.from({ length: BOX_COUNT }, (_, i) => ({ name: "", wallpaper: i % 16, slots: Array<Member | null>(SLOTS_PER_BOX).fill(null) })), unlockedWallpapers: [] };
}

export function boxedMembers(state: { storage: Storage }): Member[] {
  return state.storage.boxes.flatMap((box) => box.slots.filter((m): m is Member => m !== null));
}
export const allMembers = (state: MemberCollection): Member[] => [...state.party, ...boxedMembers(state)];

export function validPosition(position: MemberPosition): boolean {
  const inRange = (n: number, max: number): boolean => Number.isInteger(n) && n >= 0 && n < max;
  return position.kind === "party" ? inRange(position.index, 6) : position.kind === "box" && inRange(position.box, BOX_COUNT) && inRange(position.slot, SLOTS_PER_BOX);
}
export function memberAt(state: MemberCollection, position: MemberPosition): Member | null {
  if (!validPosition(position)) throw new Error("position out of bounds");
  return position.kind === "party" ? state.party[position.index] ?? null : state.storage.boxes[position.box]!.slots[position.slot]!;
}
export function locateMember(state: MemberCollection, id: string): MemberLocation | null {
  const index = state.party.findIndex((m) => m.id === id);
  if (index >= 0) return { member: state.party[index]!, position: { kind: "party", index } };
  for (const [box, record] of state.storage.boxes.entries()) for (const [slot, member] of record.slots.entries()) if (member?.id === id) return { member, position: { kind: "box", box, slot } };
  return null;
}

export function firstFreeBox(storage: Storage): Extract<MemberPosition, { kind: "box" }> | null {
  const order = [storage.currentBox, ...Array.from({ length: BOX_COUNT }, (_, i) => i).filter((i) => i !== storage.currentBox)];
  for (const box of order) { const slot = storage.boxes[box]!.slots.indexOf(null); if (slot >= 0) return { kind: "box", box, slot }; }
  return null;
}

/** Called on a private next-state only. Caller commits it atomically with its other changes. */
export function placeInBox(storage: Storage, member: Member): Extract<MemberPosition, { kind: "box" }> {
  const target = firstFreeBox(storage);
  if (!target) throw new Error("no room in the 40 × 30 boxes");
  storage.boxes[target.box]!.slots[target.slot] = member;
  storage.currentBox = target.box;
  return target;
}

/** Render fallback is pure: it never replaces an old stored choice. */
export function displayWallpaper(storage: Storage, box: number): number {
  if (!Number.isInteger(box) || box < 0 || box >= BOX_COUNT) throw new Error("box out of bounds");
  const value = storage.boxes[box]?.wallpaper;
  return value !== undefined && (BASIC_WALLPAPERS.includes(value) || storage.unlockedWallpapers.includes(value)) ? value : box % 16;
}
