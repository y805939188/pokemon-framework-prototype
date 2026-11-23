/** Minimal MZ Window_Base view. The caller owns its scene and forwards existing input samples. */
import type { Translator } from '../../framework/i18n/translator';
import type { FieldMenuModel, FieldMenuView } from './field-shortcut-menu';

interface Rect { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
interface BasicWindow {
  readonly innerWidth: number; readonly innerHeight: number;
  readonly contents: { clear(): void; fontFace: string; fontSize: number };
  drawText(text: string, x: number, y: number, width: number, align?: string): void;
  readonly parent?: { removeChild(value: BasicWindow): void } | null;
  show(): void; hide(): void; destroy(): void;
}
interface Host {
  readonly scene: { addWindow(value: BasicWindow): void };
  readonly Window_Base: new (rect: Rect) => BasicWindow;
  readonly Rectangle: new (x: number, y: number, width: number, height: number) => Rect;
  readonly width: number; readonly height: number; readonly translator: Pick<Translator, 'lang' | 'font' | 'tOr'>;
}
const text: Readonly<Record<string, readonly [string, string]>> = {
  title: ['Shortcuts', '快捷菜单'], party: ['Field moves', '场外招式'], moves: ['Field moves', '场外招式'], items: ['Registered items', '登记道具'],
  cancel: ['Cancel', '取消'], empty: ['Register items in the Bag for this menu.', '可在背包登记物品到此菜单。'], help: ['Arrows: choose   Enter: use   Esc: back', '方向键选择　回车使用　Esc返回'],
  unavailable: ['This shortcut is no longer available.', '此快捷项目当前不可用。'], handler: ['This item has no field action here.', '此处没有该道具的场外效果。'],
};
export function createMZFieldShortcutView(host: Host): FieldMenuView {
  const win = new host.Window_Base(new host.Rectangle(0, 0, host.width, host.height));
  let disposed = false;
  try { host.scene.addWindow(win); } catch (error) { win.destroy(); throw error; }
  const tr = (key: string): string => { const pair = text[key]!; return host.translator.tOr('world.shortcut.' + key, pair[host.translator.lang === 'zh' ? 1 : 0]); };
  return {
    show(model) {
      if (disposed) return;
      win.contents.clear(); win.contents.fontFace = host.translator.font() ?? 'sans-serif';
      const width = win.innerWidth, height = win.innerHeight, line = Math.min(32, Math.floor(height / 6)), columns = model.entry === 'party' ? 1 : 2;
      win.contents.fontSize = Math.min(20, Math.max(12, line - 4));
      win.drawText(tr(model.entry === 'party' ? 'party' : 'title'), 0, 0, width);
      const slots = Math.max(1, Math.floor((height - line * 5) / line));
      for (let column = 0; column < columns; column++) {
        const x = column * width / columns, cellWidth = width / columns - 8, entries = model.columns[column]!;
        win.drawText(tr(column === 0 ? 'moves' : 'items'), x, line, cellWidth);
        const start = column === model.column ? Math.max(0, Math.min(model.row, entries.length - 1) - slots + 1) : 0;
        for (let index = start; index < Math.min(entries.length, start + slots); index++) {
          const entry = entries[index]!, label = entry.kind === 'item' ? entry.name + ' ×' + entry.quantity : entry.name + ' · ' + entry.memberName;
          win.drawText((model.column === column && model.row === index ? '▶ ' : '  ') + label, x, line * (index - start + 2), cellWidth);
        }
      }
      const cancelling = model.row === model.columns[model.column].length;
      win.drawText((cancelling ? '▶ ' : '  ') + tr('cancel'), 0, height - line * 3, width);
      const message = model.message ? tr(model.message === 'field-handler-unavailable' ? 'handler' : 'unavailable') : model.empty ? tr('empty') : '';
      win.drawText(message, 0, height - line * 2, width);
      win.drawText(tr('help'), 0, height - line, width); win.show();
    },
    hide() { if (!disposed) win.hide(); },
    dispose() { if (disposed) return; disposed = true; try { win.parent?.removeChild(win); } finally { win.destroy(); } },
  };
}
