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
      const lines = log.textPages(prefix).flat();
      if (prefix !== text) log.setLines(lines);
      else {
        // Publish the completed lines through the existing log append seam.
        // Partial prefixes remain paints, never completed-message notifications.
        log.setLines([]);
        for (const line of lines) { if (!current()) return; log.add(line); }
      }
    },
    close: () => {
      if (scene._ordinaryMessage !== step) return;
      scene._ordinaryMessage = null;
      if (current()) { log.pause = false; log.setLines([]); }
    },
  });
  return step;
}
