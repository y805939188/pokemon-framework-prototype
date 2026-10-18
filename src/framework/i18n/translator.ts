/**
 * Text resolution: one entry point for every player-facing string. Entity ids, text keys and display text are separate
 * things: code names a KEY (and gives parameters), a locale table supplies the text. Pure, no host access.
 * Behaviour: requested language, then the fallback chain, then a visible `[missing:key]` marker (never an exception,
 * never an empty string) and the miss is recorded for diagnostics.
 */
export type Params = Record<string, string | number>;

export interface LocaleTable {
  meta: { name: string; /** CSS font-family list for UI text in this language (optional). */ font?: string };
  text: Record<string, string>;
}

export interface TextDiagnostics {
  /** Keys that no table in the chain could resolve. */
  missingKeys: string[];
  /** Placeholders the caller did not supply, as "key:{name}". */
  missingParams: string[];
}

export interface Translator {
  readonly lang: string;
  t(key: string, params?: Params): string;
  /** t() that returns `fallback` (not a marker, no diagnostic) when the key does not exist anywhere. */
  tOr(key: string, fallback: string, params?: Params): string;
  has(key: string): boolean;
  font(): string | undefined;
  diagnostics(): TextDiagnostics;
}

const PLACEHOLDER = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

export function placeholdersOf(text: string): string[] {
  return [...new Set([...text.matchAll(PLACEHOLDER)].map((m) => m[1] as string))].sort();
}

export function createTranslator(tables: Record<string, LocaleTable>, lang: string, fallback: readonly string[] = ["en"]): Translator {
  const chain = [lang, ...fallback.filter((f) => f !== lang)];
  const missingKeys = new Set<string>();
  const missingParams = new Set<string>();
  const find = (key: string): string | undefined => {
    for (const l of chain) { const v = tables[l]?.text[key]; if (v !== undefined) return v; }
    return undefined;
  };
  const fill = (key: string, text: string, params?: Params): string => text.replace(PLACEHOLDER, (whole, name: string) => {
    const v = params?.[name];
    if (v === undefined) { missingParams.add(`${key}:{${name}}`); return whole; }
    return String(v);
  });
  return {
    lang,
    t(key, params) {
      const text = find(key);
      if (text === undefined) { missingKeys.add(key); return `[missing:${key}]`; }
      return fill(key, text, params);
    },
    tOr(key, fallbackText, params) {
      const text = find(key);
      return text === undefined ? fallbackText : fill(key, text, params);
    },
    has: (key) => find(key) !== undefined,
    font: () => tables[lang]?.meta.font ?? tables[chain[1] ?? lang]?.meta.font,
    diagnostics: () => ({ missingKeys: [...missingKeys].sort(), missingParams: [...missingParams].sort() }),
  };
}

export interface LocaleCheck {
  /** In the base language but not in the other one. */
  missing: string[];
  /** In the other language but unknown to the base (typos, stale keys). */
  extra: string[];
  /** Same key, different placeholders (a translation that would lose or misspell a parameter). */
  placeholderMismatch: { key: string; expected: string[]; actual: string[] }[];
}

export function checkLocale(base: LocaleTable, other: LocaleTable): LocaleCheck {
  const missing = Object.keys(base.text).filter((k) => !(k in other.text)).sort();
  const extra = Object.keys(other.text).filter((k) => !(k in base.text)).sort();
  const placeholderMismatch: LocaleCheck["placeholderMismatch"] = [];
  for (const k of Object.keys(base.text)) {
    const o = other.text[k];
    if (o === undefined) continue;
    const e = placeholdersOf(base.text[k] as string), a = placeholdersOf(o);
    if (e.join() !== a.join()) placeholderMismatch.push({ key: k, expected: e, actual: a });
  }
  return { missing, extra, placeholderMismatch };
}
