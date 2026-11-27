'use strict';
// Historical runtimes have a different directory layout. These seven hashes pin
// exact Git-tracked *path names*; the caller separately verifies the original
// expected file bytes. Never search for interchangeable files by basename/content.
const {createHash} = require('node:crypto');
const {execFileSync} = require('node:child_process');
const assert = require('node:assert/strict');
const pins = Object.freeze({
  "tests/support/items/held-conservation/support.cjs": "2c72fa59b5ec6a23ca3517e6655302d408051086e475179992fc68a8270d8df2",
  "tests/support/items/held-conservation/runtime-plan.json": "4c349602784af13ef6c1794d22846ff035477f16200c52571a8079fc80eb0602",
  "tests/support/saves/mz-slot-host.cjs": "7c146ac3524c620eaaa7d4d0a11f3e62107384ac0704cccc7355104cdd175cfa",
  "tests/support/saves/continue-host.cjs": "138200e99525d1ef3fe0bde9b5ef5b326242c051ab93e7392ffa8c5c9f82828b",
  "tests/support/battle-host/victory-music-driver-host.cjs": "2fe1cee4b4adbb97744a9a05bb9e1ed87fafd84dcd6170590435ee33f346b3d5",
  "tests/support/battle-host/battle-music-composition-host.cjs": "eba7d5e4ddb8935500edb82e28280138cf4b3e8926d00bbbeb0630122b6ef80d",
  "tests/support/battle-host/native-plans/victory-music-native-plan.json": "c27e8aa2f9a8d64229cdfbef4e2c951a66f784cc34ca8ed56b6f7600d62df574"
});
const digest = path => createHash('sha256').update(path).digest('hex');
function frozenLayout(root) {
  let tracked;
  return name => {
    if (!Object.hasOwn(pins, name)) return name;
    tracked ??= execFileSync('git', ['-C', root, 'ls-tree', '-r', '-z', '--name-only', 'HEAD'],
      {encoding:'utf8', maxBuffer:16*1024*1024}).split('\0').filter(Boolean);
    const matches = tracked.filter(path => digest(path) === pins[name]);
    assert.equal(matches.length, 1, 'exact frozen path required for ' + name);
    return matches[0];
  };
}
module.exports = {frozenLayout};
