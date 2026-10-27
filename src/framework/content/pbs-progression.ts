/** Local PBS progression token rules, derived from WP04/WP31 (reference R); no file I/O. */
import type { EvolutionEntry, SpeciesKey } from '../rules/types';
import { evolutionMethod, parseEvolutionInteger } from '../rules/evolution-data';

/** WP04's position-dependent markers are two physical characters: backslash then quote.
 * Plain quotes are retained. Only a non-final completed token has its markers removed.
 * Internal empty positions survive; trailing empty positions are missing values. */
export function progressionCsv(value: string): string[] {
  const rest = value.split(',');
  while (rest.length && rest[rest.length - 1]!.trim() === '') rest.pop();
  const result: string[] = [];
  while (rest.length) {
    let token = rest.shift()!;
    while ((token.match(/"/g)?.length ?? 0) % 2 && rest.length) token += ',' + rest.shift()!;
    token = token.trim();
    if (rest.length && token.startsWith('\\"') && token.endsWith('\\"')) token = token.slice(2, -2);
    result.push(token);
  }
  return result;
}

export interface EvolutionProperty { value: string; line: number }
export interface EvolutionParseOptions {
  plural?: EvolutionProperty;
  singles: readonly EvolutionProperty[];
  resolveSpecies: (symbol: string) => SpeciesKey | null;
  fail: (line: number, field: string, message: string) => void;
}
const SYMBOL = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Last plural group, then all singular rows in their original order. Fixed singular tails are ignored. */
export function parsePbsEvolutions(options: EvolutionParseOptions): EvolutionEntry[] {
  const result: EvolutionEntry[] = [];
  const parse = (tokens: string[], line: number, field: string): void => {
    const targetToken = tokens[0], methodToken = tokens[1];
    const target = targetToken && SYMBOL.test(targetToken) ? options.resolveSpecies(targetToken) : null;
    if (!target) { options.fail(line, field, `unknown or invalid evolution target symbol "${targetToken ?? ''}"`); return; }
    const method = methodToken ? evolutionMethod(methodToken) : null;
    if (!method) { options.fail(line, field, `unknown evolution method "${methodToken ?? ''}"`); return; }
    const entry: EvolutionEntry = { target: target.species, ...(target.form ? { form: target.form } : {}), method: method.id };
    const parameter = tokens[2];
    if (method.parameterKind !== 'none' && parameter === undefined) {
      options.fail(line, field, `${method.id} requires a parameter (reference R entry gate)`); return;
    }
    if (method.parameterKind === 'integer') {
      const parsed = parseEvolutionInteger(parameter!);
      if (!parsed.ok) { options.fail(line, field, parsed.reason === 'unsupported-integer-representation' ? 'unsupported-integer-representation: decimal value exceeds the framework safe integer representation (not a reference upper bound)' : 'evolution parameter must be unsigned decimal integer text (u)'); return; }
      entry.parameter = parsed.value;
    } else if (method.parameterKind === 'species') {
      const ref = parameter && SYMBOL.test(parameter) ? options.resolveSpecies(parameter) : null;
      if (!ref || ref.form !== 0) { options.fail(line, field, `unknown or invalid base species parameter "${parameter ?? ''}"`); return; }
      entry.parameter = ref.species;
    } else if (method.parameterKind === 'flag') {
      if (!parameter?.length) { options.fail(line, field, 'flag parameter must be nonempty text'); return; }
      entry.parameter = parameter;
    } else if (method.parameterKind !== 'none') {
      if (!parameter || !SYMBOL.test(parameter)) { options.fail(line, field, `${method.parameterKind} parameter must be a valid symbol`); return; }
      entry.parameter = parameter.toLowerCase().replace(/_/g, method.parameterKind === 'item' ? '-' : '');
    }
    // A no-parameter method consumes no semantic parameter, including any PBS placeholder.
    result.push(entry);
  };
  if (options.plural) {
    const tokens = progressionCsv(options.plural.value);
    if (!tokens.length) options.fail(options.plural.line, 'Evolutions', 'empty PBS text lacks the required first evolution target/method group');
    for (let i = 0; i < tokens.length; i += 3) parse(tokens.slice(i, i + 3), options.plural.line, 'Evolutions');
  }
  for (const property of options.singles) parse(progressionCsv(property.value).slice(0, 3), property.line, 'Evolution');
  return result;
}
