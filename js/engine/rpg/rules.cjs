'use strict';
// Compatibility facade (kept so plugins and tests keep their require paths): the implementation is strict TypeScript
// in src/framework/, bundled into js/engine/build/engine.cjs by `pnpm --dir src build:engine`. Do not add logic here.
module.exports = require('../build/engine.cjs').rules;
