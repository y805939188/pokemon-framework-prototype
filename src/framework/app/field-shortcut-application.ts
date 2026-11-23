/** Actual App observation feeds the advisory leaf. Execution always re-enters the real owner. */
import { FieldShortcutQuery } from './field-shortcut-query';
import type { FieldShortcutQueries } from './field-shortcut-query';
import { qualifyFieldMove, FIELD_MOVE_IDS } from '../rules/field-moves';
import type { FieldMoveFacts } from '../rules/field-moves';
import { classifyFieldItem } from '../rules/field-items';
import { itemOf } from '../rules/item-catalog';
import type { ItemCatalog } from '../rules/item-catalog';
import type { Content } from '../rules/types';
import type { GameState } from '../rules/state';
import type { WorldLocalState } from '../rules/world-state';
import { qualifyTravel } from '../rules/world-travel';
import type { TravelQualification } from '../rules/world-travel';

export interface ApplicationShortcutObservation {
  readonly game: GameState; readonly content: Content; readonly catalog: ItemCatalog;
  readonly local: WorldLocalState; readonly facts: FieldMoveFacts; readonly eligibilityIdentity: string;
  readonly handlers: Readonly<{ localMoves: boolean; fishing: boolean; fieldItems: boolean; travel?: boolean }>;
  readonly travel?: TravelQualification;
  readonly unavailable: boolean;
}
/** capture is the App's trusted native transaction, not a pair of caller read/catalog providers. */
export function applicationFieldShortcuts(capture: () => ApplicationShortcutObservation): FieldShortcutQueries {
  let actual: ApplicationShortcutObservation | undefined;
  return new FieldShortcutQuery({
    observe: () => {
      actual = capture();
      return { state: { inventory: actual.game.inventory, party: actual.game.party }, catalog: actual.catalog, eligibilityIdentity: actual.eligibilityIdentity };
    },
    hasItemHandler: itemId => {
      if (!actual || actual.unavailable) return false;
      const item = itemOf(actual.catalog, itemId), action = item && classifyFieldItem(item);
      if (!action) return false;
      return action.kind === 'fishing' ? actual.handlers.fishing
        : action.kind === 'sweet-scent' ? actual.handlers.localMoves
        : action.kind === 'escape-rope' ? actual.handlers.travel === true && !!actual.travel && qualifyTravel('escape-rope', actual.travel).status === 'eligible' : true;
    },
    abilities: {
      hasHandler: moveId => !!actual && !actual.unavailable && (moveId === 'fly' || moveId === 'dig' || moveId === 'teleport'
        ? actual.handlers.travel === true : actual.handlers.localMoves && FIELD_MOVE_IDS.some(id => id === moveId)),
      canUse: (member, moveId) => {
        if (!actual || actual.unavailable) return false;
        if (moveId === 'fly' || moveId === 'dig' || moveId === 'teleport') return !!actual.travel && qualifyTravel(moveId, { ...actual.travel, flyMember: moveId === 'fly' ? member : undefined }).status === 'eligible';
        const localId = FIELD_MOVE_IDS.find(id => id === moveId);
        if (localId === 'flash' && (actual.facts.flashMask?.status !== 'value' || actual.facts.flashMask.value !== true)) return false;
        return !!localId && qualifyFieldMove({ moveId: localId, entry: 'shortcut', memberId: member.id,
          context: { party: actual.game.party, badges: actual.game.badges, content: actual.content,
            world: actual.game.world, local: actual.local, facts: actual.facts } }).status === 'ready';
      },
      name: moveId => actual?.content.moves?.[moveId]?.name ?? moveId,
    },
    memberName: member => member.nickname ?? member.species,
  });
}
