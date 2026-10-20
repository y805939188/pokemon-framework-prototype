/**
 * Content pipeline, authoring and compiled shapes (schema version 1, the minimum this step needs).
 * Authors write JSON files (see content/sample/); `compileContent` validates them and produces one deterministic
 * compiled document. Showdown-owned battle data (base stats, display names, move names) is NOT copied here: records
 * name a `showdownId` and the runtime assembly resolves it against the pinned Showdown build.
 */
import type { CurveId, PartialStats } from "../rules/types.ts";

export const SCHEMA_VERSION = 1;
export const CURVES_ALLOWED: readonly CurveId[] = ["medium", "fast", "slow", "parabolic", "erratic", "fluctuating"];
export const STAT_KEYS_ALLOWED = ["hp", "atk", "def", "spa", "spd", "spe"] as const;

export type SourceKind = "showdown" | "author-placeholder" | "spec-derived";
export type SourceStatus = "confirmed" | "placeholder" | "pending";

/** Provenance registry entry: where data comes from, under which terms, and whether that is settled. */
export interface SourceEntry {
  id: string;
  kind: SourceKind;
  description: string;
  license: string;
  ref: string;
  status: SourceStatus;
  usedFor: string[];
}

export interface LearnEntry { level: number; move: string }

export interface SpeciesSource {
  id: string;
  showdownId: string;
  nameKey: string;
  growth: CurveId;
  baseExp: number;
  evYield: PartialStats;
  catchRate: number;
  learnset: LearnEntry[];
  source: string;
}

export type OverridableField = "nameKey" | "growth" | "baseExp" | "evYield" | "catchRate" | "learnset";
export const OVERRIDABLE: readonly OverridableField[] = ["nameKey", "growth", "baseExp", "evYield", "catchRate", "learnset"];

export interface Overlay {
  target: string;
  set: Partial<Pick<SpeciesSource, OverridableField>>;
  reason: string;
}

export interface Manifest {
  schema: number;
  id: string;
  title: string;
}

/** A one-time reward package as the author writes it (grants.json). Species are content ids, items are bag item ids. */
export interface GrantSource {
  id: string;
  members: { species: string; level: number }[];
  items: Record<string, number>;
  money: number;
  source: string;
}

export interface ContentInputs {
  manifest: unknown;
  sources: unknown;
  species: unknown;
  overlays: unknown;
  /** Optional (step 4). An absent file means no grants and leaves the input hash of older content unchanged. */
  grants?: unknown;
}

export interface ContentError {
  file: "manifest.json" | "sources.json" | "species.json" | "overlays.json" | "grants.json" | "compiled" | "assembly";
  path: string;
  message: string;
}

export interface CompiledContent {
  schema: number;
  contentId: string;
  inputsHash: string;
  sources: SourceEntry[];
  overlaysApplied: number;
  species: SpeciesSource[];
  /** Absent in documents compiled before step 4 (= no grants). */
  grants?: GrantSource[];
}

/** Grant ids stay short: the members they create are named G-<grant id>-<n>, and member ids are limited to 18 characters. */
export const GRANT_ID = /^[a-z][a-z0-9-]{0,11}$/;
