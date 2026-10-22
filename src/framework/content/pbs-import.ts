/**
 * Import subset of author-provided PBS species data (decision D5-2; WP04 §4.2 reading rules, WP03 §4.3/§5.3).
 * Reads the base species sections of a `pokemon.txt` text and produces species records for species.json, keeping only
 * the fields the framework owns; everything else is reported, never dropped silently:
 *   imported     GrowthRate, BaseExp, EVs, CatchRate (omitted -> 255, WP03 §4.3), Moves (level-up)
 *   showdown     battle data the pinned Showdown build provides at run time (not imported: it would be a second copy)
 *   later        fields of later batches (forms 5.1, evolution/dex/teaching 5.3, wild items 5.5, breeding after the
 *                first version): listed per record as information not carried over
 *   ignored      keys outside the reference's species schema: not consumed, like the reference's reader (WP04 §4.2)
 * Reading rules kept from WP04 §4.2: a line whose FIRST character is "#" or that is blank is skipped; otherwise the
 * text from the first "#" is removed and the rest trimmed (an indented comment is therefore an invalid line inside a
 * section); "[ID]" opens a section; "Key = Value" is a property; a property before any section is an error; a repeated
 * property overrides the earlier one; a section id used twice is refused. Quoted CSV values are outside this subset and
 * refused (the reference's position-dependent quote rule is not implemented). Pure: text in, records and report out.
 * Section ids: only base species sections are read. The raw id must be a symbol (letters, digits, underscore, not
 * starting with a digit: WP03 §5.1 type `m`) BEFORE it is turned into a content id, so a form section such as
 * "[PORYGON,2]" (forms: 5.1) or a mistyped id such as "[PIKA!CHU]" is refused at its line, never read as another species.
 * Enumerations (growth rates, stats, field lists) are looked up as own keys only ("constructor" is not a growth rate).
 */
import type { CurveId, PartialStats, StatKey } from "../rules/types.ts";
import { own } from "../rules/own.ts";
import type { LearnEntry, SpeciesSource } from "./schema.ts";

export interface PbsProblem { line: number; path: string; message: string }

export interface PbsRecordReport {
  id: string;
  line: number;
  /** Showdown species id derived from the section id (lowercase letters and digits); the assembly checks it. */
  showdownId: string;
  showdown: string[];
  later: { field: string; batch: string }[];
  ignored: string[];
  overridden: string[];
  defaults: string[];
}

export interface PbsImport {
  ok: boolean;
  species: SpeciesSource[];
  records: PbsRecordReport[];
  errors: PbsProblem[];
}

const GROWTH: Record<string, CurveId> = { Medium: "medium", Fast: "fast", Slow: "slow", Parabolic: "parabolic", Erratic: "erratic", Fluctuating: "fluctuating" };
const STAT: Record<string, StatKey> = { HP: "hp", ATTACK: "atk", DEFENSE: "def", SPECIAL_ATTACK: "spa", SPECIAL_DEFENSE: "spd", SPEED: "spe" };
const IMPORTED = ["GrowthRate", "BaseExp", "EVs", "CatchRate", "Moves"];
const SHOWDOWN = ["Name", "Types", "BaseStats", "Abilities", "HiddenAbilities", "GenderRatio", "Height", "Weight"];
const LATER: Record<string, string> = {
  FormName: "5.1 forms", Happiness: "5.1/5.3 friendship", TutorMoves: "5.3 teaching", EggMoves: "after the first version (breeding)",
  Evolutions: "5.3 evolution", Pokedex: "5.3 dex", Category: "5.3 dex", Color: "5.3 dex", Shape: "5.3 dex", Habitat: "5.3 dex",
  Generation: "5.3 dex", Flags: "5.3", Incense: "after the first version (breeding)", Offspring: "after the first version (breeding)",
  EggGroups: "after the first version (breeding)", HatchSteps: "after the first version (breeding)",
  WildItemCommon: "5.5 wild held items", WildItemUncommon: "5.5 wild held items", WildItemRare: "5.5 wild held items",
};
const SECTION = /^\[\s*(.*?)\s*\]$/;
const ID = /^[a-z][a-z0-9-]{0,30}$/;
/** A symbol identity as the reference's section names (WP03 §5.1 `m`): letters, digits, underscore; no leading digit. */
const SYMBOL = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Base section id (a symbol, e.g. "PIDGEY", "MR_MIME") -> content id (lowercase, "_" -> "-") and Showdown id
 * (lowercase letters and digits, the form Showdown's ids take). Null when the id is not a symbol: nothing is guessed.
 */
export const deriveIds = (section: string): { id: string; showdownId: string } | null => {
  if (!SYMBOL.test(section)) return null;
  return { id: section.toLowerCase().replace(/_/g, "-"), showdownId: section.toLowerCase().replace(/_/g, "") };
};

const int = (v: string | undefined, lo: number, hi: number): number | null => (v !== undefined && /^\d+$/.test(v) && Number(v) >= lo && Number(v) <= hi ? Number(v) : null);

export function importPbsSpecies(text: string, sourceId: string): PbsImport {
  const errors: PbsProblem[] = [];
  const sections: { name: string; line: number; props: Map<string, { value: string; line: number }>; overridden: Set<string> }[] = [];
  let cur: (typeof sections)[number] | null = null;
  for (const [i, raw] of text.split(/\r?\n/).entries()) {
    const line = i + 1;
    if (raw.startsWith("#") || raw.trim() === "") continue; // physical comment / blank line (WP04 §4.2)
    const body = (raw.includes("#") ? raw.slice(0, raw.indexOf("#")) : raw).trim();
    const sec = SECTION.exec(body);
    if (sec) {
      const name = sec[1]!;
      if (name.includes(",")) { errors.push({ line, path: `[${name}]`, message: `"[${name}]" is a form section (species, form): forms are not part of this import subset (5.1, pokemon_forms.txt); not imported` }); cur = null; continue; }
      if (!SYMBOL.test(name)) { errors.push({ line, path: `[${name}]`, message: `section id "${name}" is not a symbol (letters, digits and underscore, not starting with a digit: WP03 §5.1); not imported` }); cur = null; continue; }
      if (sections.some((s) => s.name === name)) { errors.push({ line, path: `[${name}]`, message: `section "${name}" is used twice` }); cur = null; continue; }
      cur = { name, line, props: new Map(), overridden: new Set() };
      sections.push(cur);
      continue;
    }
    if (!cur) { if (!sections.length && !errors.length) errors.push({ line, path: "$", message: "missing initial section (a property needs a [SECTION] first)" }); continue; } // lines of a refused section are skipped with it
    const eq = body.indexOf("=");
    if (eq <= 0) { errors.push({ line, path: `[${cur.name}]`, message: body === "" ? "invalid property line: an indented comment is not a comment for this reader (WP04 §4.2)" : `invalid property syntax "${body.slice(0, 40)}" (expected Key = Value)` }); continue; }
    const key = body.slice(0, eq).trim(), value = body.slice(eq + 1).trim();
    if (value.includes('"')) { errors.push({ line, path: `[${cur.name}].${key}`, message: "quoted values are outside this import subset" }); continue; }
    if (cur.props.has(key)) cur.overridden.add(key); // a repeated property: the later value wins (WP04 §4.2)
    cur.props.set(key, { value, line });
  }

  const species: SpeciesSource[] = [];
  const records: PbsRecordReport[] = [];
  const ids = new Set<string>();
  for (const s of sections) {
    const { id, showdownId } = deriveIds(s.name)!; // the section id was checked when the section opened
    const at = (k: string): number => s.props.get(k)?.line ?? s.line;
    const fail = (k: string, message: string): void => { errors.push({ line: at(k), path: `[${s.name}].${k}`, message }); };
    if (!ID.test(id)) { fail("$", `section id "${s.name}" does not give a usable content id ("${id}")`); continue; }
    if (ids.has(id)) { fail("$", `section "${s.name}" gives the content id "${id}" of an earlier section`); continue; }
    ids.add(id);
    const report: PbsRecordReport = { id, line: s.line, showdownId, showdown: [], later: [], ignored: [], overridden: [...s.overridden].sort(), defaults: [] };
    for (const k of s.props.keys()) {
      if (IMPORTED.includes(k)) continue;
      if (SHOWDOWN.includes(k)) report.showdown.push(k);
      else if (own(LATER, k) !== undefined) report.later.push({ field: k, batch: own(LATER, k)! });
      else report.ignored.push(k);
    }
    const value = (k: string): string | undefined => s.props.get(k)?.value;
    const csv = (k: string): string[] => (value(k) ?? "").split(",").map((x) => x.trim()).filter((x) => x !== "");
    let ok = true;
    const growthText = value("GrowthRate");
    const growth = growthText !== undefined ? own(GROWTH, growthText) : undefined;
    if (!growth) { ok = false; fail("GrowthRate", growthText === undefined ? "missing: the framework needs a growth rate and the spec records no default for it" : `"${growthText}" is not a growth rate (${Object.keys(GROWTH).join(", ")})`); }
    const baseExp = int(value("BaseExp"), 1, 1000);
    if (baseExp === null) { ok = false; fail("BaseExp", value("BaseExp") === undefined ? "missing: the framework needs a base experience and the spec records no default for it" : "must be an integer from 1 to 1000"); }
    let catchRate = 255;
    if (value("CatchRate") === undefined) report.defaults.push("CatchRate = 255 (WP03 §4.3 class default)");
    else { const c = int(value("CatchRate"), 0, 255); if (c === null) { ok = false; fail("CatchRate", "must be an integer from 0 to 255"); } else catchRate = c; }
    const evYield: PartialStats = {};
    const ev = csv("EVs");
    if (value("EVs") === undefined) { ok = false; fail("EVs", "missing: the framework needs the EV yield and the spec records no default for it"); }
    else if (ev.length % 2) { ok = false; fail("EVs", "must be pairs of STAT,amount (WP03 §5.3 named pairs)"); }
    else for (let j = 0; j < ev.length; j += 2) {
      const stat = own(STAT, ev[j]!), n = int(ev[j + 1], 1, 255);
      if (!stat || n === null) { ok = false; fail("EVs", `pair ${j / 2 + 1} "${ev[j]},${ev[j + 1]}" must be a stat (${Object.keys(STAT).join(", ")}) and a positive amount`); continue; }
      if (evYield[stat] !== undefined) { ok = false; fail("EVs", `${ev[j]} is named twice`); continue; }
      evYield[stat] = n;
    }
    const learnset: LearnEntry[] = [];
    const mv = csv("Moves");
    if (value("Moves") === undefined || !mv.length) { ok = false; fail("Moves", "missing: a species needs level-up moves to be created"); }
    else if (mv.length % 2) { ok = false; fail("Moves", "must be pairs of level,MOVE"); }
    else for (let j = 0; j < mv.length; j += 2) {
      const level = int(mv[j], 1, 100), move = (mv[j + 1] ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
      if (level === null || !move) { ok = false; fail("Moves", `pair ${j / 2 + 1} "${mv[j]},${mv[j + 1]}" must be a level 1..100 and a move id`); continue; }
      if (learnset.some((e) => e.level === level && e.move === move)) { report.overridden.push(`Moves ${level},${move} (repeated)`); continue; }
      learnset.push({ level, move });
    }
    records.push(report);
    if (ok) species.push({ id, showdownId, nameKey: `species.${id.replace(/-/g, "_")}`, growth: growth!, baseExp: baseExp!, evYield, catchRate, learnset, source: sourceId });
  }
  return { ok: errors.length === 0, species, records, errors };
}
