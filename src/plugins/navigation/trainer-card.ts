import { publicIdText } from '../../framework/rules/member-identity';
import { dexRegionCounts } from '../../framework/rules/pokedex-query';
import { currentRegion } from '../../framework/rules/region-map';
import type { Content } from '../../framework/rules/types';
import type { GameState } from '../../framework/rules/state';

interface CardHost {
  game(): GameState;
  content(): Content;
  translator(): { readonly lang?: string; t(key: string, params?: Record<string, string | number>): string; font?(): string | undefined };
}

/** WP65 trainer-card front. Read existing authorities once per opening; never acquire a write operation. */
export function installTrainerCard(G: any, flow: () => CardHost): void {
  const tr = (key: string, params?: Record<string, string | number>) => flow().translator().t('navigation.trainerCard.' + key, params);
  function Card(this: any) { this.initialize(); }
  Card.prototype = Object.create(G.Scene_MenuBase.prototype);
  Card.prototype.constructor = Card;
  const P = Card.prototype;
  P.initialize = function () { G.Scene_MenuBase.prototype.initialize.call(this); this._closing = false; };
  // Back is the only action. Keep the existing host cancel button and semantic keyboard/gamepad input.
  P.create = function () {
    G.Scene_MenuBase.prototype.create.call(this);
    const top = this._cancelButton ? this._cancelButton.y + this._cancelButton.height : 0;
    const win = new G.Window_Base(new G.Rectangle(0, top, G.Graphics.boxWidth, G.Graphics.boxHeight - top));
    this.addWindow(win); this._window = win;
    const host = flow(), game = host.game(), content = host.content();
    const mapId = G.$gameMap.mapId(), metadata = content.mapMetadata?.maps[String(mapId)];
    const region = currentRegion(metadata ? { status: 'value', value: metadata } : { status: 'absent' });
    if (region.status !== 'ready') throw Error(region.reason);
    const counts = dexRegionCounts(game.dex, content.regionalDex!, -1);
    const badges = game.badges.slice(region.regionId * 8, region.regionId * 8 + 8);
    // Capture the same read-only card values once; a language change only redraws presentation.
    const rows = [
      ['name', game.player.name], ['id', publicIdText(game.player.id)],
      ['money', String(game.money).replace(/\B(?=(\d{3})+(?!\d))/g, ',')],
      ['pokedex', counts.owned + ' / ' + counts.seen], ['time', '—'], ['started', '—'],
    ];
    this.refreshText = () => {
      this._language = host.translator().lang;
      win.contents.clear();
      const b = win.contents, width = b.width, rowHeight = Math.min(40, Math.floor((b.height - 126) / 6));
      win.resetFontSettings(); b.fontSize = Math.min(22, rowHeight - 6);
      const font = host.translator().font?.(); if (font) b.fontFace = font;
      const text = (value: string, x: number, y: number, w: number, align = 'left') => b.drawText(value, x, y, w, rowHeight, align);
      text(tr('title'), 8, 0, width - 16);
      // No maintained WP06 clock or existing start-date value is available. Do not present cached zero as elapsed time.
      rows.forEach(([key, value], i) => {
        const y = 30 + i * rowHeight, labelWidth = Math.floor(width * .42);
        text(tr(key!), 8, y, labelWidth - 16); text(value!, labelWidth, y, width - labelWidth - 8, 'right');
      });
      const y = 34 + 6 * rowHeight;
      text(tr('badges', { region: region.regionId }), 8, y, width - 16);
      // Preserve eight positions, including gaps; a second region starts at badge index eight.
      for (let slot = 0; slot < 8; slot++) if (badges[slot] === true) {
        text(String(slot + 1), 8 + slot * (width - 16) / 8, y + 28, (width - 16) / 8, 'center');
      }
      text(tr('back'), 8, b.height - rowHeight, width - 16);
    };
    this.refreshText();
  };
  P.start = function () {
    G.Scene_MenuBase.prototype.start.call(this);
    G.SoundManager.playOk(); this.startFadeIn(this.fadeSpeed(), false);
  };
  P.popScene = function () {
    if (this._closing) return;
    this._closing = true; G.SoundManager.playCancel(); this.startFadeOut(this.fadeSpeed(), false);
  };
  P.update = function () {
    if (this._language !== flow().translator().lang) this.refreshText();
    G.Scene_MenuBase.prototype.update.call(this);
    if (this.isBusy()) return;
    if (this._closing) { G.Scene_MenuBase.prototype.popScene.call(this); return; }
    if (G.Input.isTriggered('cancel') || G.TouchInput.isCancelled()) this.popScene();
  };
  G.Scene_PSTrainerCard = Card;
  const commands = G.Window_MenuCommand?.prototype, menu = G.Scene_Menu?.prototype;
  if (commands && menu) {
    const add = commands.addOriginalCommands, create = menu.createCommandWindow;
    commands.addOriginalCommands = function (...args: any[]) {
      add.apply(this, args); this.addCommand(flow().game().player.name, 'psTrainerCard', true);
    };
    menu.createCommandWindow = function (...args: any[]) {
      create.apply(this, args); this._commandWindow.setHandler('psTrainerCard', () => G.SceneManager.push(Card));
    };
  }
}
