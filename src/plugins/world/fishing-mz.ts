/** Production composition of the existing fishing presentation leaf. */
import type { FishingPresentationPort } from '../../framework/app/fishing-operation';
import type { HostInput } from '../host-input';
import { createFishingCharacters } from './fishing-character-mz';
import { createFishingHost } from './fishing-host';
import type { FishingHostSession } from './fishing-host';

export function createFishingMZ(root: Record<string, unknown>, input: () => HostInput, assertCurrent: (owner: object) => void, parameters: Record<string, unknown> = {}, diagnostic: (reason: string) => void = () => {}) {
  const characters = createFishingCharacters(root, parameters, diagnostic);
  let active: FishingHostSession | null = null;
  const presentation: FishingPresentationPort = {
    begin(owner, emit, config) {
      if (active) throw Error('fishing-presentation-active');
      const session = createFishingHost(root, { input: input(), assertCurrent, characters, diagnostic, ...config }).begin(owner, emit);
      active = session;
      const dispose = (): void => { try { session.dispose(); } finally { if (active === session) active = null; } };
      return { run(effect) { session.run(effect); if (effect.kind === 'finished' && active === session) active = null; }, sample: session.sample, dispose };
    },
  };
  return { presentation, pending: () => active !== null,
    stateReplaced: () => {
      const old = active;
      try { old?.dispose(); }
      catch (error) { try { diagnostic('fishing-state-replacement-cleanup:' + String(error)); } catch { /* A display diagnostic cannot stop authoritative state replacement. */ } }
      finally { if (active === old) active = null; }
    },
    update: () => { active?.update(); if (!active) characters.reproject(); } };
}
