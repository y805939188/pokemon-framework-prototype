import { blackout, worldTravel, wildGeneration } from '../../../../../src/framework/rules/index';

// These three independent call-site errors must each remain TS2345. Missing exports/imports do not satisfy this gate.
blackout.planBlackoutReturn(42);
worldTravel.planTravel('teleport', 42);
wildGeneration.balancedPartyLevel(42);
