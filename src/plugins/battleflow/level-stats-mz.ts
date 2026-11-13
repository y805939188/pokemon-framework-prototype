/* eslint-disable @typescript-eslint/no-explicit-any */
import { LevelStatsStep } from './level-stats';
import type { LevelStats, LevelStatsPage } from './level-stats';

/** One window per queued level, with no reference to members or application write ports. */
export function createLevelStatsMZ(G: any, scene: any, level: number, stats: { before: LevelStats; after: LevelStats }, current: () => boolean, translator: any): LevelStatsStep {
  let window: any = null;
  const close = () => {
    const own = window; window = null;
    if (!own) return;
    if (scene._levelStatsWindow === own) scene._levelStatsWindow = null;
    own.pause = false; own.hide(); own.parent?.removeChild(own); own.destroy({ children: true });
  };
  return new LevelStatsStep(level, stats, {
    current, update: () => scene._pictureUpdate,
    use: () => G.Input.isTriggered('ok') || G.TouchInput?.isTriggered?.() === true,
    confirmSound: () => G.SoundManager?.playOk?.(),
    close,
    show: (page: LevelStatsPage) => {
      if (!current()) return;
      if (!window) {
        const width = Math.min(320, G.Graphics.boxWidth), height = Math.min(348, G.Graphics.boxHeight);
        window = new G.Window_Base(new G.Rectangle(G.Graphics.boxWidth - width, 0, width, height));
        scene._levelStatsWindow = window; scene.addWindow(window);
      }
      if (!current()) { close(); return; }
      const view = window;
      view.resetFontSettings();
      const font = translator.font(); if (font) view.contents.fontFace = font;
      view.contents.clear();
      const width = view.innerWidth, line = view.lineHeight();
      view.drawText(translator.t('ui.levelStats.' + page.phase, { level: page.level }), 0, 0, width);
      page.rows.forEach((row, index) => {
        view.drawText(translator.t('stat.' + row.key), 0, (index + 2) * line, width - 88);
        const text = page.phase === 'delta' && row.value >= 0 ? '+' + row.value : String(row.value);
        view.drawText(text, width - 88, (index + 2) * line, 88, 'right');
      });
      view._levelStatsPage = { ...page, rows: page.rows.map(row => ({ ...row })) };
      view.pause = true; view.show();
    },
  });
}
