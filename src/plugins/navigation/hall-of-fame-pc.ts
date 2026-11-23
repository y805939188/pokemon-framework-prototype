import type { HallOfFameSnapshot } from '../../framework/rules/hall-of-fame';
import type { Content } from '../../framework/rules/types';
import { hostInput } from '../host-input';
import type { InputFrame } from '../management/model';

interface HallOfFameHost {
  content(): Pick<Content, 'regionalDex'>;
  speciesName(species: string, form: number): string;
  translator(): {
    readonly lang?: string;
    t(key: string, params?: Record<string, string | number>): string;
    font?(): string | undefined;
  };
}

/** Each browser owns one detached view and returns through the native PC scene stack. */
export function openHallOfFame(
  G: any, flow: () => HallOfFameHost, history: HallOfFameSnapshot, current: () => boolean,
): void {
  const base = G.Scene_MenuBase.prototype, input = hostInput(G);
  let entryIndex = history.entries.length - 1;
  let entry = history.entries[entryIndex];
  let memberIndex = 0;
  let accessing = true;
  let pressed: InputFrame['pressed'] = {};
  const firstNumber = history.entries[0]?.number;

  // An out-of-range attempt leaves the displayed entry in place. Another key
  // in the same frame can recover from the changed indices before exit.
  function move(delta: number): boolean {
    memberIndex += delta;
    if (memberIndex >= 0 && memberIndex < (entry?.members.length ?? 0)) return true;
    entryIndex += delta < 0 ? 1 : -1;
    const destination = history.entries[entryIndex];
    if (!destination) return false;
    entry = destination;
    memberIndex = delta < 0 ? Math.max(0, entry.members.length - 1) : 0;
    return true;
  }

  function exit(scene: any, audible: boolean): void {
    if (G.SceneManager._scene !== scene || G.SceneManager.isSceneChanging()) return;
    if (audible && current()) G.SoundManager.playCancel();
    base.popScene.call(scene);
  }

  function History(this: any) { base.initialize.call(this); }
  History.prototype = Object.create(base);
  History.prototype.constructor = History;
  const P = History.prototype;
  P.create = function () {
    base.create.call(this);
    if (!current()) return;
    const width = Math.min(560, G.Graphics.boxWidth);
    const top = this._cancelButton ? this._cancelButton.y + this._cancelButton.height : 0;
    this._historyWindow = new G.Window_Base(new G.Rectangle(
      (G.Graphics.boxWidth - width) / 2, top, width, G.Graphics.boxHeight - top,
    ));
    this.addWindow(this._historyWindow);
    this._cancelButton?.setClickHandler(() => exit(this, true));
    this.refreshHistory();
  };
  P.start = function () {
    base.start.call(this);
    pressed = input.inputFrame().pressed;
  };
  P.refreshHistory = function () {
    const host = flow(), translator = host.translator(), window = this._historyWindow;
    const tr = (key: string, params?: Record<string, string | number>) => translator.t('navigation.hallOfFame.' + key, params);
    const lines: string[] = [];
    if (accessing) {
      lines.push(tr('accessed'), tr('accessHelp'));
    } else if (entry === undefined || firstNumber === undefined) {
      lines.push(tr('title'), tr('emptyHistory'), tr('back'));
    } else {
      const member = entry.members[memberIndex];
      lines.push(tr('number', { number: firstNumber + entryIndex }));
      if (member) {
        const species = member.isEgg ? tr('egg') : host.speciesName(member.species, member.form) || member.species;
        const name = member.isEgg ? species : member.nickname || species;
        const gender = member.isEgg ? '' : member.gender === 'M' ? ' ♂' : member.gender === 'F' ? ' ♀' : '';
        const dex = member.isEgg ? 0 : (host.content().regionalDex?.national.indexOf(member.species) ?? -1) + 1;
        lines.push(tr('member', { name, member: memberIndex + 1, total: entry.members.length }));
        lines.push(dex > 0 ? tr('dex', { species, number: dex }) + gender : species + gender);
        if (!member.isEgg) lines.push(tr('level', { level: member.level }));
        lines.push(tr('id', { id: member.publicId ?? '—' }));
      } else {
        lines.push(tr('emptyEntry'));
      }
      lines.push(tr('directionHelp'), tr('useHelp'));
    }
    this._historyLanguage = translator.lang;
    window.contents.clear();
    window.resetFontSettings();
    const font = translator.font?.();
    if (font) window.contents.fontFace = font;
    const rowHeight = Math.min(36, Math.floor(window.innerHeight / lines.length));
    lines.forEach((line, row) => window.drawText(line, 0, row * rowHeight, window.innerWidth));
  };
  P.update = function () {
    if (!current()) { exit(this, false); return; }
    base.update.call(this);
    if (G.SceneManager.isSceneChanging()) return;
    const frame = input.inputFrame();
    const edge = (key: 'back' | 'use' | 'left' | 'right') => frame.pressed[key] ? !pressed[key] : frame.triggered[key];
    const back = edge('back');
    const use = edge('use'), left = edge('left'), right = edge('right');
    pressed = frame.pressed;
    if (back) { exit(this, true); return; }

    let changed = false;
    if (accessing) {
      if (use) { accessing = false; changed = true; }
    } else if (entry && (use || left || right)) {
      let keepBrowsing = true;
      if (use) keepBrowsing = move(10);
      if (left) keepBrowsing = move(-1);
      if (right) keepBrowsing = move(1);
      if (!keepBrowsing) { exit(this, false); return; }
      changed = true;
    }
    if (changed || this._historyLanguage !== flow().translator().lang) this.refreshHistory();
  };
  G.SceneManager.push(History);
}
