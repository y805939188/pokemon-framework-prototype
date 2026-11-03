import { OrdinaryMessageStep } from './ordinary-message';

/** Uses the existing measured text window; never ellipsizes a battle message. */
export function createOrdinaryMessageMZ(G: any, scene: any, text: string, current: () => boolean): OrdinaryMessageStep {
  const log = scene._log;
  let step: OrdinaryMessageStep;
  step = new OrdinaryMessageStep(text, {
    current, update: () => scene._pictureUpdate,
    useOrBack: () => G.Input.isTriggered('ok') || G.Input.isTriggered('cancel') || G.TouchInput?.isTriggered?.() === true,
    paint: prefix => {
      if (!current()) return;
      scene._ordinaryMessage = step;
      log.pause = false;
      log.setLines(log.textPages(prefix).flat());
    },
    close: () => {
      if (scene._ordinaryMessage !== step) return;
      scene._ordinaryMessage = null;
      if (current()) { log.pause = false; log.setLines([]); }
    },
  });
  return step;
}
