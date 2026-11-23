/** Typed test composition only: the real WorldOperation and PS_World retain their existing owners. */
import type { FishingPresentationPort } from '../../../src/framework/app/fishing-operation';
import type { FishingAdvance, FishingEffect } from '../../../src/framework/rules/fishing';
import type { HostInput } from '../../../src/plugins/host-input';
import { createFishingHost } from '../../../src/plugins/world/fishing-host';
import type { FishingCharacters } from '../../../src/plugins/world/fishing-character-mz';
import type { FishingHostSession } from '../../../src/plugins/world/fishing-host';

export function composeFishingPresentation(root: unknown, input: HostInput, assertCurrent: (owner: object) => void,
  probe: { readonly characters?: FishingCharacters; session(value: FishingHostSession): void; effect(value: FishingEffect): void; advance(value: FishingAdvance): void }): FishingPresentationPort {
  return {
    begin(owner, emit, config) {
      const actual = createFishingHost(root, { input, assertCurrent, characters: probe.characters, ...config }).begin(owner, advance => { probe.advance(advance); emit(advance); });
      probe.session(actual);
      return { run(effect) { probe.effect(effect); actual.run(effect); }, sample: () => actual.sample(), dispose: () => actual.dispose() };
    },
  };
}
