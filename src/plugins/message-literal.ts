/** Literal user text for one native MZ message conversion. Keep stored names and authored controls intact. */
export const messageLiteral = (text: string): string => text.replace(/\\/g, '\\\\').replace(/\x1b/g, '␛');
