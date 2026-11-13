import type { BattleDriverFactory } from '../../../src/framework/battle/driver';
import { createScriptedFactory } from '../../../src/framework/tools/scripted-driver';

// The complete base interface is statically satisfied. An author's additional
// display metadata still cannot mint any production source/owner/ticket.
const base: BattleDriverFactory = createScriptedFactory({ turns: [] });
export const annotated: BattleDriverFactory = Object.assign(base, {
  supported: { requiredSettlement: true, trainerAi: true, replacementOffers: true },
});
