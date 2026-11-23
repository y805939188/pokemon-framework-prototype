import { AuthorParameterError } from './author-command';

export interface InlineChoice { variable: number; cancel: number; choices: string[] }

/** Read one authored, single-line ch field list. Replacement values never enter this parser. */
export function readInlineChoice(text: string, start: number, field: string): { value: InlineChoice; end: number } {
  const fail = (hint: string): never => { throw new AuthorParameterError(field + '.ch', hint); };
  const fields: string[] = [];
  let at = start;
  for (;;) {
    while (text[at] === ' ' || text[at] === '\t') at++;
    let value = '';
    if (text[at] === '"') {
      const first = ++at;
      while (at < text.length && text[at] !== '"' && text[at] !== '\n' && text[at] !== '\r') at++;
      if (text[at] !== '"') fail('Close each single-line quoted ch field; quote escapes are not supported.');
      value = text.slice(first, at++);
    } else {
      const first = at;
      while (at < text.length && text[at] !== ',' && text[at] !== ']') {
        if (text[at] === '"' || text[at] === '\n' || text[at] === '\r') fail('Use ordinary single-line fields or complete double-quoted fields.');
        at++;
      }
      value = text.slice(first, at).trim();
    }
    fields.push(value);
    if (text[at] === ']') break;
    if (text[at] !== ',') fail('Close ch with ]; a quoted field must be followed immediately by a comma or ].');
    at++;
  }
  if (fields.length < 3) fail('Provide a variable, cancellation value and at least one choice.');
  const variableText = fields[0]!.trim(), cancelText = fields[1]!.trim();
  const variable = Number(variableText);
  if (!/^\d+$/.test(variableText) || !Number.isSafeInteger(variable)) fail('Use a nonnegative decimal variable ID.');
  let cancel = 0;
  if (/^[+-]?\d+$/.test(cancelText)) {
    cancel = Number(cancelText);
    if (!Number.isSafeInteger(cancel)) fail('Use a safe integer cancellation value.');
  } else if (/^[+\-.\d]/.test(cancelText)) fail('Use a complete decimal integer, or ordinary nonnumeric text for cancellation zero.');
  return { value: { variable, cancel, choices: fields.slice(2) }, end: at + 1 };
}
