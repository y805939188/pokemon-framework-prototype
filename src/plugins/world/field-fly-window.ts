/** Minimal destination picker over the actual App's current-region point list. */
import type { FlyDestination } from '../../framework/rules/region-map';
import type { FlyMenuView } from './field-fly-menu';
import type { createMZFieldShortcutView } from './field-shortcut-window';

type Host = Parameters<typeof createMZFieldShortcutView>[0] & {
  name(destination: FlyDestination): string;
  regionName(regionId: number): string;
};
export function createMZFlyDestinationView(host: Host): FlyMenuView {
  const window = new host.Window_Base(new host.Rectangle(0, 0, host.width, host.height));
  let disposed = false;
  try { host.scene.addWindow(window); }
  catch (error) { window.destroy(); throw error; }
  const label = (key: string, en: string, zh: string): string => host.translator.tOr('world.fly.' + key, host.translator.lang === 'zh' ? zh : en);
  return {
    show(model) {
      if (disposed) return;
      window.contents.clear(); window.contents.fontFace = host.translator.font() ?? 'sans-serif'; window.contents.fontSize = 20;
      const line = 32, width = window.innerWidth, height = window.innerHeight;
      window.drawText(label('title', 'Fly destination', '飞行目的地') + ' · ' + host.regionName(model.regionId), 0, 0, width);
      if (!model.destinations.length) window.drawText(label('empty', 'No visited destination is available.', '当前没有可用的已访问目的地。'), 0, line * 2, width);
      const slots = Math.max(1, Math.floor((height - line * 4) / line));
      const start = Math.max(0, Math.min(model.row, model.destinations.length - 1) - slots + 1);
      for (let index = start; index < Math.min(model.destinations.length, start + slots); index++) {
        const destination = model.destinations[index]!;
        window.drawText((index === model.row ? '▶ ' : '  ') + host.name(destination), 0, line * (index - start + 2), width);
      }
      window.drawText((model.row === model.destinations.length ? '▶ ' : '  ') + label('cancel', 'Cancel', '取消'), 0, height - line * 2, width);
      window.drawText(label('help', 'Arrows: choose   Enter: fly   Esc: back', '方向键选择　回车飞行　Esc返回'), 0, height - line, width);
      window.show();
    },
    dispose() { if (disposed) return; disposed = true; try { window.parent?.removeChild(window); } finally { window.destroy(); } },
  };
}
