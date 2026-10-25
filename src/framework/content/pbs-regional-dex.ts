/** WP62 regional PBS author proposal. Source gate runs before any caller-owned text reader. */
export interface PbsFile { file: string; read: () => string }
export type PbsSourceGate = (sourceId: string) => string | null;
export interface PbsLocatedProblem { file?: string; line: number; path: string; message: string }
export interface RegionNameKey { id: number; nameKey: string }
export interface RegionalDexProposal { source: string; regions: { id: number; nameKey: string; species: string[] }[] }
export interface PbsRegionalOptions {
  files: readonly PbsFile[];
  sourceId: string;
  sourceProblem: PbsSourceGate;
  /** Exact, previously validated original PBS base-symbol resolver. No deriving JSON ids here. */
  resolveSpecies: (symbol: string) => string | null;
  regionNameKeys: readonly RegionNameKey[];
}
export interface PbsRegionalImport { ok: boolean; regionalDex?: RegionalDexProposal; errors: PbsLocatedProblem[] }
const NAME_KEY = /^[a-z][a-z0-9_.]{1,60}$/;
const canonicalSymbol = (token: string): string => {
  const upper = token.trim().toUpperCase();
  return upper === 'NIDORANMA' ? 'NIDORANmA' : upper === 'NIDORANFE' ? 'NIDORANfE' : upper;
};

export function importPbsRegionalDex(options: PbsRegionalOptions): PbsRegionalImport {
  const errors: PbsLocatedProblem[] = [];
  const fail = (file: string, line: number, path: string, message: string): void => { errors.push({ file, line, path, message }); };
  const gate = !options.sourceId ? 'sourceId is required' : typeof options.sourceProblem !== 'function' ? 'a checked source validator is required' : options.sourceProblem(options.sourceId);
  if (gate) { fail('sources.json', 0, options.sourceId || '$.sourceId', gate); return { ok: false, errors }; }
  if (typeof options.resolveSpecies !== 'function') { fail('regional-dex', 0, '$.resolveSpecies', 'a checked original PBS symbol resolver is required'); return { ok: false, errors }; }
  const regions = new Map<number, { id: number; species: string[]; file: string; line: number }>();
  for (const file of options.files) {
    let text: string;
    try { text = file.read(); } catch (error) { fail(file.file, 0, '$', `cannot read input: ${error instanceof Error ? error.message : String(error)}`); continue; }
    let current: ReturnType<typeof regions.get>;
    for (const [i, raw] of text.split(/\r?\n/).entries()) {
      const line = i + 1;
      // Regional reader is the dedicated preprocessed-line family (WP62), including indented comments.
      const body = raw.split('#', 1)[0]!.trim();
      if (!body) continue;
      const section = /^\[(.*?)\]$/.exec(body);
      if (section) {
        const token = section[1]!.trim(), id = /^\d+$/.test(token) ? Number(token) : NaN;
        current = undefined;
        if (!Number.isSafeInteger(id) || id < 0) { fail(file.file, line, `[${token}]`, 'region section must be a nonnegative safe integer'); continue; }
        if (regions.has(id)) { fail(file.file, line, `[${token}]`, `region ${id} is used twice`); continue; }
        current = { id, species: [], file: file.file, line }; regions.set(id, current); continue;
      }
      if (!current) { fail(file.file, line, '$', 'missing initial region section or content inside a refused section'); continue; }
      for (const token of body.split(',')) {
        const symbol = canonicalSymbol(token), species = options.resolveSpecies(symbol);
        if (!symbol || !species) { fail(file.file, line, `[${current.id}]`, `unknown PBS species symbol "${symbol}"`); continue; }
        if (current.species.includes(species)) { fail(file.file, line, `[${current.id}]`, `species "${species}" is listed twice in region ${current.id}`); continue; }
        current.species.push(species);
      }
    }
  }
  const ordered = [...regions.values()].sort((a, b) => a.id - b.id);
  // Check positions, not an attacker-controlled 0..MAX_SAFE_INTEGER loop.
  for (const [i, region] of ordered.entries()) if (region.id !== i) fail(region.file, region.line, `[${region.id}]`, `regional ids must be continuous from 0 (missing ${i})`);
  const names = new Map<number, string>();
  if (!Array.isArray(options.regionNameKeys)) fail('regionNameKeys', 0, '$', 'regionNameKeys must be a dense array');
  else for (let i = 0; i < options.regionNameKeys.length; i++) {
    const entry = options.regionNameKeys[i], at = `$[${i}]`;
    if (!Object.hasOwn(options.regionNameKeys, i) || !entry || typeof entry !== 'object' || !Number.isSafeInteger(entry.id) || entry.id < 0 || typeof entry.nameKey !== 'string' || !NAME_KEY.test(entry.nameKey)) { fail('regionNameKeys', 0, at, 'expected {id: nonnegative integer, nameKey: valid NAME_KEY}'); continue; }
    if (names.has(entry.id)) fail('regionNameKeys', 0, `${at}.id`, `duplicate region name id ${entry.id}`);
    else names.set(entry.id, entry.nameKey);
    if (!regions.has(entry.id)) fail('regionNameKeys', 0, `${at}.id`, `unknown region ${entry.id}`);
  }
  for (const region of ordered) if (!names.has(region.id)) fail(region.file, region.line, `[${region.id}].nameKey`, 'missing explicit author regionNameKeys entry');
  if (errors.length) return { ok: false, errors };
  return { ok: true, regionalDex: { source: options.sourceId, regions: ordered.map(region => ({ id: region.id, nameKey: names.get(region.id)!, species: [...region.species] })) }, errors };
}
