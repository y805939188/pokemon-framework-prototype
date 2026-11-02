/* eslint-disable @typescript-eslint/no-explicit-any */
import type { BallScenePorts, BallPose } from './ball-scene';
interface BallHandle { sprite: any; bitmap: any; released: boolean; }

/** Private code-generated red/white placeholder; replace this port for authored ball art. */
export function createBallPortsMZ(G: any, scene: any, current: () => boolean, updateOrdinal: () => number,
  target: (scale: number) => boolean, box: (opacity: number) => boolean): BallScenePorts<BallHandle> {
  const release = (handle: BallHandle) => {
    if (handle.released) return; handle.released = true;
    const errors: unknown[] = [];
    for (const apply of [() => handle.sprite?.parent?.removeChild(handle.sprite), () => { if (handle.sprite) handle.sprite.bitmap = null; },
      () => handle.sprite?.destroy(), () => handle.bitmap?.destroy()]) try { apply(); } catch (error) { errors.push(error); }
    if (errors.length) throw new AggregateError(errors, 'private ball visual cleanup failed');
  };
  const guard = () => { if (!current()) throw new Error('stale ball visual'); };
  return { current, updateOrdinal, target, box,
    create: () => {
      const handle: BallHandle = { sprite: null, bitmap: null, released: false };
      try {
        guard(); handle.bitmap = new G.Bitmap(24, 24); guard(); handle.bitmap.fillAll('#f3f5f7'); guard();
        handle.bitmap.fillRect(0, 0, 24, 11, '#d54c48'); guard(); handle.bitmap.fillRect(0, 10, 24, 4, '#263445'); guard();
        handle.bitmap.fillRect(9, 9, 6, 6, '#f3f5f7'); guard(); handle.sprite = new G.Sprite(handle.bitmap); guard();
        handle.sprite.anchor.x = .5; guard(); handle.sprite.anchor.y = .5; guard();
        handle.sprite._psBallFeedback = true;
        const index = scene._windowLayer ? scene.children.indexOf(scene._windowLayer) : -1;
        if (index >= 0) scene.addChildAt(handle.sprite, index); else scene.addChild(handle.sprite);
        guard(); return handle;
      } catch (error) { try { release(handle); } catch (cleanup) { throw new AggregateError([error, cleanup], 'ball visual allocation and cleanup failed'); } throw error; }
    },
    paint: (handle: BallHandle, pose: Readonly<BallPose>) => {
      if (handle.released || !current()) return;
      const sprite = handle.sprite, width = G.Graphics.boxWidth;
      for (const apply of [() => { sprite.x = width * (.25 + .5 * pose.flight); },
        () => { sprite.y = 350 - 140 * pose.flight - 90 * pose.lift + 40 * pose.drop; },
        () => { sprite.rotation = pose.rotation; }, () => { sprite.scale.x = sprite.scale.y = pose.scale; },
        () => { sprite.opacity = Math.round(255 * pose.opacity); sprite.visible = pose.opacity > 0; }]) {
        if (handle.released || !current()) return; apply();
      }
    }, release };
}
