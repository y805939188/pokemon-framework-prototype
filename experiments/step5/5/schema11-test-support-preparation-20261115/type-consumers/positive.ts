import { blackout, worldTravel, wildGeneration } from '../../../../../src/framework/rules/index';

type IsAny<T> = 0 extends (1 & T) ? true : false;
type NoAny<T extends false> = T;
export type BlackoutResultIsTyped = NoAny<IsAny<ReturnType<typeof blackout.planBlackoutReturn>>>;
export type TravelResultIsTyped = NoAny<IsAny<ReturnType<typeof worldTravel.planTravel>>>;
export type WildResultIsTyped = NoAny<IsAny<ReturnType<typeof wildGeneration.createWildSpecies>>>;

const blackoutResult: blackout.BlackoutPlanResult = blackout.planBlackoutReturn({
  origin: { kind: 'field', sourceId: 'final-public-contract' },
  world: { recentCenter: null },
  mapResource() { return { status: 'unavailable' }; },
});
if (blackoutResult.status === 'planned') {
  const owner: 'field' | 'battle' = blackoutResult.plan.settlement.owner;
  void owner;
}
const places: worldTravel.TravelPlaces = {
  healingSpot: null, escapePoint: null, characterHome: null, globalHome: null,
};
const travelResult: worldTravel.TravelPlanResult = worldTravel.planTravel('fly', places, { flyDestination: null });
const needsConfirmation: boolean = worldTravel.travelNeedsConfirmation('teleport');
const balancedLevel: number = wildGeneration.balancedPartyLevel([5, 7]);
void travelResult;
void needsConfirmation;
void balancedLevel;
