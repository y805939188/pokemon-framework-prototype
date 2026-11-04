/** Read-only move-button presentation. Choice legality and PP consumption stay in the Session. */
const colours: Readonly<Record<string, string>> = {
  Normal: '#8b8b74', Fighting: '#b94b40', Flying: '#8675bf', Poison: '#934d9f', Ground: '#ac884b',
  Rock: '#918039', Bug: '#7c922e', Ghost: '#65517c', Steel: '#737f96', Fire: '#cf6a38',
  Water: '#4d7cbd', Grass: '#639c45', Electric: '#d0ac35', Psychic: '#c55178', Ice: '#53989b',
  Dragon: '#6550aa', Dark: '#65564a', Fairy: '#b8749c',
};

export interface MoveChoiceView {
  name: string;
  type: string | null;
  typeLabel: string;
  typeColour: string;
  typeTextColour: string;
  pp: string | null;
  ppColour: string;
}

/** Graphical menus omit PP for unlimited/PP-less requests, including Recharge. */
export function movePP(pp: unknown, maxpp: unknown): Pick<MoveChoiceView, 'pp' | 'ppColour'> {
  if (typeof pp !== 'number' || typeof maxpp !== 'number' || !Number.isSafeInteger(pp)
    || !Number.isSafeInteger(maxpp) || pp < 0 || maxpp <= 0) return { pp: null, ppColour: '#202028' };
  return { pp: `PP ${pp}/${maxpp}`, ppColour: pp === 0 ? '#bd2929'
    : pp <= maxpp / 4 ? '#b35d00' : pp <= maxpp / 2 ? '#8b7300' : '#202028' };
}

/** Display metadata comes from the checked, locked Gen8 Dex; never writes an action or combat state. */
export function moveChoice(name: string, type: string | null, label: string, pp: unknown, maxpp: unknown): MoveChoiceView {
  const known = type !== null && Object.prototype.hasOwnProperty.call(colours, type);
  const colour = known ? colours[type!] : '#707781';
  const rgb = [1, 3, 5].map(at => parseInt(colour.slice(at, at + 2), 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  const light = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  return { name, type: known ? type : null, typeLabel: known ? label : '?',
    typeColour: colour, typeTextColour: 1.05 / (light + 0.05) >= (light + 0.05) / 0.05 ? '#ffffff' : '#000000', ...movePP(pp, maxpp) };
}
