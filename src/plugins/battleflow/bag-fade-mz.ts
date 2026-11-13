/* eslint-disable @typescript-eslint/no-explicit-any */
import type { BattleSceneVisualStep } from './controller';
import { createPrebattleOverlayMZ } from './prebattle-mz';

/** Menu-only blackout. One private cover, no cached texture or battle/state mutation. */
export function createBagFadeMZ(G: any, scene: any, current: () => boolean,
  update: () => number, swap: () => void): BattleSceneVisualStep & { snapshot(): object } {
  const half = 150;
  let phase: 'out' | 'in' | 'done' | 'cancelled' = 'out', opacity = 0;
  let start: number | null = null, incoming: number | null = null, ordinal = -1;
  let cover: ReturnType<typeof createPrebattleOverlayMZ> | null = null;
  const dispose = () => { const owned = cover; cover = null; owned?.dispose(); };
  const cancel = () => { if (phase === 'done' || phase === 'cancelled') return; phase = 'cancelled'; dispose(); };
  return {
    kind: 'visual', cancel,
    snapshot: () => ({ version: 'd2-bag-fade-v1', phase, opacity, halfMilliseconds: half }),
    advance(now) {
      if (phase === 'done' || phase === 'cancelled') return true;
      if (!current()) { cancel(); return true; }
      if (ordinal === update()) return false;
      ordinal = update();
      if (start === null) {
        start = now;
        const host = { Graphics: { boxWidth: G.Graphics.width ?? G.Graphics.boxWidth,
          boxHeight: G.Graphics.height ?? G.Graphics.boxHeight }, Bitmap: G.Bitmap, Sprite: G.Sprite };
        cover = createPrebattleOverlayMZ(host, { addChild(node: any) { node._psBagFade = true; scene.addChild(node); } }, current);
      }
      if (incoming === null) {
        opacity = Math.min(1, Math.max(0, (now - start) / half));
        cover!.paint('black', opacity);
        if (!current()) { cancel(); return true; }
        if (opacity < 1) return false;
        swap(); // The complete blackout owns the view change; input remains locked by the controller queue.
        if (!current()) { cancel(); return true; }
        incoming = now; phase = 'in'; return false;
      }
      opacity = 1 - Math.min(1, Math.max(0, (now - incoming) / half));
      cover!.paint('black', opacity);
      if (!current()) { cancel(); return true; }
      if (opacity > 0) return false;
      phase = 'done'; dispose(); return true;
    },
  };
}
