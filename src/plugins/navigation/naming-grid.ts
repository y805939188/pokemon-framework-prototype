import type { Direction, InputFrame } from '../management/model';

/** WP17 §6.2.1: spaces and Greek/symbol identities are input data. */
export const NAMING_ROWS: readonly (readonly string[])[] = [
  ['ABCDEFGHIJ ,.', "KLMNOPQRST '-", 'UVWXYZ     ♂♀', '             ', '0123456789   '],
  ['abcdefghij ,.', "klmnopqrst '-", 'uvwxyz     ♂♀', '             ', '0123456789   '],
  ['ÀÁÂÄÃàáâäã Ææ', 'ÈÉÊË èéêë  Çç', 'ÌÍÎÏ ìíîï  Œœ', 'ÒÓÔÖÕòóôöõ Ññ', 'ÙÚÛÜ ùúûü  Ýý'],
  [',.:;…•!?¡¿ ♂♀', '“”‘’﴾﴿*~_^ ΡΚ', '@#&%+-×÷/= ΠΜ', '◎○□△♠♥♦♣★✨  $', '♈♌♒♐♩♪♫☽☾    '],
];
const characters = NAMING_ROWS.map(group => group.flatMap(row => Array.from(row)));
const available = characters.map(group => Array.from({ length: 13 }, (_, column) =>
  column === 12 || [0, 1, 2, 3, 4].some(row => group[row * 13 + column] !== ' ')));
const representative = [0, 2, 4, 6, 9, 11];
export type NamingOperation = 'move' | 'mode' | 'locate' | 'delete' | 'insert' | 'confirm';

/** One local editor; it has no actor, game-state, persistence or host input owner. */
export class NamingGrid {
  group = 0;
  index = 0;
  text: string;
  constructor(initial: string, readonly max: number) { this.text = initial; }
  character(index: number): string { return characters[this.group][index]; }
  columnAvailable(column: number): boolean { return available[this.group][column]; }
  move(direction: Direction): number {
    if (this.index >= 65) {
      const control = this.index - 65;
      if (direction === 'left' || direction === 'right') return 65 + (control + (direction === 'left' ? 5 : 1)) % 6;
      return (direction === 'up' ? 52 : 0) + representative[control];
    }
    const row = Math.floor(this.index / 13), column = this.index % 13;
    if (direction === 'left' || direction === 'right') {
      let next = column;
      do { next = (next + (direction === 'left' ? 12 : 1)) % 13; } while (!available[this.group][next]);
      return row * 13 + next;
    }
    const nextRow = row + (direction === 'up' ? -1 : 1);
    if (nextRow >= 0 && nextRow < 5) return nextRow * 13 + column;
    return 65 + (column >= 11 ? 5 : column >= 8 ? 4 : Math.floor(column / 2));
  }
  erase(): void { this.text = Array.from(this.text).slice(0, -1).join(''); }
  step(frame: InputFrame): NamingOperation | null {
    const direction = (['left', 'right', 'up', 'down'] as const).find(key => frame.repeated[key]);
    if (direction) {
      const next = this.move(direction);
      if (next !== this.index) { this.index = next; return 'move'; }
    }
    if (frame.triggered.special) { this.group = (this.group + 1) % 4; return 'mode'; }
    if (frame.triggered.action) { this.index = 70; return 'locate'; }
    if (frame.triggered.back) { this.erase(); return 'delete'; }
    if (!frame.triggered.use) return null;
    if (this.index >= 65 && this.index <= 68) { this.group = this.index - 65; return 'mode'; }
    if (this.index === 69) { this.erase(); return 'delete'; }
    if (this.index === 70) return 'confirm';
    const text = Array.from(this.text);
    if (text.length >= this.max) text.pop();
    text.push(this.character(this.index)); this.text = text.join('');
    if (this.group === 0 && text.length === 1) this.group = 1;
    if (text.length >= this.max) this.index = 70;
    return 'insert';
  }
}
