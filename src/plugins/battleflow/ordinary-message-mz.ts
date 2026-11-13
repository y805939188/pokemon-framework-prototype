import { OrdinaryMessageStep, PausedMessageStep } from './ordinary-message';
import { BriefMessageStep } from './brief-message';
import type { BattleSceneVisualStep } from './controller';

// Only these owned factories identify text steps; an arbitrary visual does not replace resident text.
const textSteps = new WeakSet<BattleSceneVisualStep>();
export const isMessageStepMZ = (step: BattleSceneVisualStep): boolean => textSteps.has(step);

/** The Scene retains this handle after the controller removes its completed visual step. */
export function createBriefMessageMZ(G: any, scene: any, text: string, current: () => boolean, instantText: () => boolean): BriefMessageStep {
  const log = scene._log;
  let step: BriefMessageStep;
  step = new BriefMessageStep(text, {
    current, update: () => scene._pictureUpdate,
    useOrBack: () => G.Input.isTriggered('ok') || G.Input.isTriggered('cancel') || G.TouchInput?.isTriggered?.() === true,
    paint: prefix => {
      if (!current()) return;
      scene._residentBrief = step; log._battleTextOwner = step; log.pause = false;
      const lines = log.textPages(prefix).flat();
      if (prefix !== text) log.setLines(lines);
      else { log.setLines([]); for (const line of lines) { if (!current()) return; log.add(line); } }
    },
    close: () => {
      if (scene._residentBrief === step) scene._residentBrief = null;
      if (log._battleTextOwner !== step) return;
      log._battleTextOwner = null;
      if (current() && scene._log === log) { log.pause = false; log.setLines([]); }
    },
  }, { instantText });
  textSteps.add(step);
  return step;
}

/** Uses the existing measured text window; never ellipsizes a battle message. */
export function createOrdinaryMessageMZ(G: any, scene: any, text: string, current: () => boolean): OrdinaryMessageStep {
  return createMessageMZ(G, scene, text, current);
}

/** Paused author pages share typing/input ownership; only a fully shown page gets an arrow. */
export function createPausedMessageMZ(G: any, scene: any, text: string, current: () => boolean,
  battleEnded: () => boolean, instant: () => boolean): PausedMessageStep {
  return createMessageMZ(G, scene, text, current, { battleEnded, instant });
}

function createMessageMZ(G: any, scene: any, text: string, current: () => boolean,
  paused?: { battleEnded(): boolean; instant(): boolean }): OrdinaryMessageStep {
  const log = scene._log;
  let step: OrdinaryMessageStep;
  const ports = {
    current, update: () => scene._pictureUpdate,
    useOrBack: () => G.Input.isTriggered('ok') || G.Input.isTriggered('cancel') || G.TouchInput?.isTriggered?.() === true,
    paint: (prefix: string) => {
      if (!current()) return;
      scene._ordinaryMessage = step;
      log._battleTextOwner = step;
      log.pause = !!paused && prefix === text;
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
      if (log._battleTextOwner === step) {
        log._battleTextOwner = null;
        if (current()) { log.pause = false; log.setLines([]); }
      }
    },
  };
  step = paused ? new PausedMessageStep(text, ports, { ...paused, confirmed: () => { if (current()) G.SoundManager?.playOk?.(); } })
    : new OrdinaryMessageStep(text, ports);
  textSteps.add(step);
  return step;
}

/** A full-text synchronization block: start the dependent presentation on the
 * following update, retaining the completed message until that block returns.
 * Currently used only for Gotcha + the mandatory 3500ms capture melody.
 */
export function createSynchronizedMessageMZ(G: any, scene: any, text: string, current: () => boolean,
  following: BattleSceneVisualStep): BattleSceneVisualStep {
  const message = createOrdinaryMessageMZ(G, scene, text, current);
  let retired = false, update = -1;
  const cancel = () => {
    if (retired) return;
    retired = true;
    try { following.cancel(); } finally { message.cancel(); }
  };
  const step: BattleSceneVisualStep = { kind: 'visual', advance(now) {
    if (retired) return true;
    if (!current()) { cancel(); return true; }
    if (update === scene._pictureUpdate) return false;
    update = scene._pictureUpdate;
    if (message.snapshot().phase !== 'full') {
      message.advance(now);
      if (!current()) { cancel(); return true; }
      return false;
    }
    // The same update that paints the full message never starts its block.
    if (!following.advance(now)) return false;
    retired = true;
    message.cancel();
    return true;
  }, cancel };
  textSteps.add(step);
  return step;
}
