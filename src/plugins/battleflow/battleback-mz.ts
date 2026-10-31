/* eslint-disable @typescript-eslint/no-explicit-any */
import { BattlebackView } from './battleback-view';
import type { BattlebackRole } from './battleback-view';
import type { BattlebackContext } from './battleback-resources';

function resourceIdentity(value: unknown): string {
  if (typeof value !== 'string' || !value || /[\u0000-\u001f\u007f\\:%?#]/.test(value) || value.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error('invalid battleback resource identity');
  }
  return value;
}
/** Explicit host presentation only; never added to application requests or save data. */
export function battlebackContext(override: any, parameters: any): Readonly<BattlebackContext> {
  if (override !== undefined && (!override || typeof override !== 'object' || Array.isArray(override))) throw new Error('invalid battleback context');
  const background = override?.background ?? parameters.battleBackground ?? 'plain';
  const platform = override?.platform !== undefined ? override.platform : parameters.battlePlatform;
  const configuredTime = parameters.battleTime === '' ? 0 : parameters.battleTime ?? 0;
  const rawTime = override?.time === undefined || override?.time === '' ? configuredTime : override.time;
  if (typeof rawTime !== 'number' && (typeof rawTime !== 'string' || !/^[+-]?\d+(?:\.\d+)?$/.test(rawTime))) throw new Error('invalid battleback time');
  const time = Number(rawTime); if (!Number.isFinite(time)) throw new Error('invalid battleback time');
  return Object.freeze({ background: resourceIdentity(background === '' ? 'plain' : background),
    ...(platform === undefined || platform === '' || platform === null ? {} : { platform: resourceIdentity(platform) }), time });
}

/** Private static image decoding; no shared ImageManager cache or global Bitmap loader hooks. */
export function createBattlebackMZ(G: any, nodeRequire: any, root: string, scene: any,
  context: BattlebackContext, current: () => boolean, failed: (error: unknown) => void): any {
  const fs = nodeRequire('fs'), path = nodeRequire('path'), url = nodeRequire('url');
  const width = G.Graphics.boxWidth, height = G.Graphics.boxHeight;
  const retired = () => ({ sprite: null, ready: false, poll() {}, dispose() {}, snapshot: () => ({ version: 'd2-battleback-view-v1', retired: true, ready: false, rows: [] }) });
  if (!current()) return retired();
  const surface = new G.Bitmap(width, height);
  if (!current()) { surface.destroy(); return retired(); }
  let sprite: any;
  try { sprite = new G.Sprite(surface); } catch (error) { surface.destroy(); throw error; }
  let destroyed = false;
  const cleanup = () => {
    if (destroyed) return; destroyed = true;
    const errors: unknown[] = [];
    for (const release of [() => sprite.parent?.removeChild(sprite), () => { sprite.bitmap = null; }, () => sprite.destroy(), () => surface.destroy()]) {
      try { release(); } catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, 'owned battleback surface cleanup failed');
  };
  const live = () => !destroyed && current();
  if (!live()) { cleanup(); return retired(); }
  const assetRoot = path.join(root, 'img', 'pokemon', 'battlebacks');
  const inside = (parent: string, child: string) => { const relative = path.relative(parent, child); return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative); };
  const resolve = (logical: string): string | null => {
    if (!live()) return null;
    const prefix = 'Graphics/Battlebacks/'; if (!logical.startsWith(prefix)) throw new Error('invalid battleback namespace');
    const identity = resourceIdentity(logical.slice(prefix.length));
    try {
      const realRoot = fs.realpathSync(assetRoot), gameRoot = fs.realpathSync(root);
      if (!live() || !inside(gameRoot, realRoot)) return null;
      for (const extension of ['.png', '.gif']) {
        const candidate = path.join(assetRoot, ...identity.split('/')) + extension;
        try {
          const realFile = fs.realpathSync(candidate);
          if (!live()) return null;
          if (inside(realRoot, realFile) && fs.statSync(realFile).isFile()) return url.pathToFileURL(realFile).href;
        } catch { /* ordinary resolution failure is missing, not a successful load */ }
      }
    } catch { /* missing resource directory: explicit code fallback, no file access outside it */ }
    return null;
  };
  const rectangles: Record<BattlebackRole, number[]> = {
    background: [0, 0, width, height], foeBase: [width * .55, 0, width * .45, 120],
    playerBase: [0, Math.max(420, height - 120), width * .5, 120], message: [0, 120, width, 300],
  };
  try {
    const view = new BattlebackView<any>(context, {
      current: live, now: () => G.performance.now(), resolve,
      load(source, loaded, rejected) {
        const image = new G.Image(); let cancelled = false, done = false;
        const stop = () => { if (cancelled) return; cancelled = true; image.onload = null; image.onerror = null; image.src = ''; };
        if (!live()) { stop(); return stop; }
        image.onload = () => {
          if (done || cancelled) return; done = true;
          if (!live()) { stop(); rejected(new Error('stale battleback load')); return; }
          let bitmap: any = null, delivered = false;
          try {
            if (!Number.isSafeInteger(image.naturalWidth) || !Number.isSafeInteger(image.naturalHeight) || image.naturalWidth < 1 || image.naturalHeight < 1) throw new Error('invalid battleback image dimensions');
            bitmap = new G.Bitmap(image.naturalWidth, image.naturalHeight);
            if (!live()) { bitmap.destroy(); bitmap = null; rejected(new Error('stale battleback allocation')); return; }
            bitmap.context.drawImage(image, 0, 0);
            if (!live()) { bitmap.destroy(); bitmap = null; rejected(new Error('stale battleback decode')); return; }
            let released = false;
            const asset = { value: bitmap, release() { if (!released) { released = true; bitmap.destroy(); } } };
            delivered = true; loaded(asset);
          } catch (error) {
            if (bitmap && !delivered) bitmap.destroy();
            if (live()) rejected(error);
          } finally { stop(); }
        };
        image.onerror = () => { if (done || cancelled) return; done = true; try { rejected(new Error('battleback image decode failed')); } finally { stop(); } };
        try { image.src = source; } catch (error) { stop(); throw error; }
        return stop;
      },
      draw(images) {
        if (!live()) return;
        surface.fillAll('#18232c'); if (!live()) return;
        for (const role of ['background', 'foeBase', 'playerBase', 'message'] as const) {
          const bitmap = images[role]; if (!bitmap) continue;
          if (!live()) return;
          surface.blt(bitmap, 0, 0, bitmap.width, bitmap.height, ...rectangles[role]);
          if (!live()) return;
        }
      },
      dispose: cleanup, failed,
    });
    if (live()) {
      const index = scene._windowLayer ? scene.children.indexOf(scene._windowLayer) : -1;
      if (index >= 0) scene.addChildAt(sprite, index); else scene.addChild(sprite);
      if (!live()) view.dispose();
    } else view.dispose();
    return { sprite, poll: () => view.poll(), get ready() { return view.ready; }, dispose: () => view.dispose(), snapshot: () => ({ ...view.snapshot(), assetDirectory: 'img/pokemon/battlebacks', worldContext: 'not-inferred' }) };
  } catch (error) {
    try { cleanup(); } catch (cleanupError) { throw new AggregateError([error, cleanupError], String(error) + '; owned cleanup also failed'); }
    throw error;
  }
}
