/* eslint-disable @typescript-eslint/no-explicit-any */
import { BattlePicturePlayback } from './picture-playback';
import type { PictureActor, PicturePose } from './picture-playback';

interface OwnedActor { body: any; shadow: any; bodyBitmap: any; shadowBitmap: any; released: boolean; }

/** Simple private code-generated portraits. Real media can replace this port without changing the timing consumer. */
export function createBattlePicturesMZ(G: any, scene: any, current: () => boolean, updateOrdinal: () => number, failed: (error: unknown) => void): BattlePicturePlayback<OwnedActor> {
  const owned = new Set<OwnedActor>();
  const release = (actor: OwnedActor) => {
    if (actor.released) return; actor.released = true;
    const errors: unknown[] = [];
    for (const sprite of [actor.body, actor.shadow]) if (sprite) {
      for (const dispose of [() => sprite.parent?.removeChild(sprite), () => { sprite.bitmap = null; }, () => sprite.destroy()]) {
        try { dispose(); } catch (error) { errors.push(error); }
      }
    }
    for (const bitmap of [actor.bodyBitmap, actor.shadowBitmap]) if (bitmap) try { bitmap.destroy(); } catch (error) { errors.push(error); }
    owned.delete(actor);
    if (errors.length) throw new AggregateError(errors, 'owned battle picture cleanup failed');
  };
  const create = (actor: Readonly<PictureActor>): OwnedActor => {
    const handle: OwnedActor = { body: null, shadow: null, bodyBitmap: null, shadowBitmap: null, released: false };
    const guard = () => { if (!current()) throw new Error('stale picture allocation'); };
    try {
      guard(); handle.bodyBitmap = new G.Bitmap(128, 80); guard();
      handle.bodyBitmap.fillAll(actor.side === 'p1' ? '#245e91' : '#9a493e'); guard();
      handle.bodyBitmap.fontSize = 16; handle.bodyBitmap.textColor = '#ffffff';
      handle.bodyBitmap.drawText(actor.name, 4, 24, 120, 30, 'center'); guard();
      handle.shadowBitmap = new G.Bitmap(80, 12); guard(); handle.shadowBitmap.fillAll('#0c1726'); guard();
      handle.shadow = new G.Sprite(handle.shadowBitmap); guard(); handle.body = new G.Sprite(handle.bodyBitmap); guard();
      for (const [role, sprite] of [['shadow', handle.shadow], ['body', handle.body]] as const) {
        if (!sprite.anchor || !sprite.scale) throw new Error('unsupported battle picture Sprite');
        sprite.anchor.x = .5; guard(); sprite.anchor.y = 1; guard();
        sprite.x = actor.side === 'p1' ? G.Graphics.boxWidth * .25 : G.Graphics.boxWidth * .75; guard();
        sprite.y = actor.side === 'p1' ? 390 : 250; guard();
        sprite._psPictureRole = role; sprite._psPictureKey = actor.side + ':' + actor.id;
        const index = scene._windowLayer ? scene.children.indexOf(scene._windowLayer) : -1;
        if (index >= 0) scene.addChildAt(sprite, index); else scene.addChild(sprite);
        guard();
      }
      owned.add(handle); return handle;
    } catch (error) {
      try { release(handle); } catch (cleanup) { throw new AggregateError([error, cleanup], 'picture allocation and cleanup failed'); }
      throw error;
    }
  };
  const paint = (actor: OwnedActor, pose: Readonly<PicturePose>) => {
    if (actor.released || !current()) return;
    for (const [sprite, value] of [[actor.body, pose.body], [actor.shadow, pose.shadow]] as const) {
      for (const apply of [() => { sprite.scale.x = value; }, () => { sprite.scale.y = value; }, () => { sprite.opacity = Math.round(value * 255); }, () => { sprite.visible = value > 0; }]) {
        if (actor.released || !current()) return; apply();
      }
    }
  };
  return new BattlePicturePlayback({ current, updateOrdinal, create, paint, release, failed });
}
