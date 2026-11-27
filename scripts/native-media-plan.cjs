'use strict';
// Frozen host plans identify the donor using its path at the original commit.
// Keep those bytes immutable; resolve only the supported donor in the current layout.
const donorKey = 'experiments/step5/4/victory-music-native-plan.json';
module.exports = function nativeMediaPlan(originalPath) {
  if (originalPath !== donorKey) throw new Error('unknown native-media donor');
  return require('../tests/support/battle-host/native-plans/victory-music-native-plan.json');
};
