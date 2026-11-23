/* Static data/metadata admission only. Does not run plugin commands or product flows. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
assert.equal(process.versions.node, '22.21.1', 'Use the project-bound Node 22.21.1');
const repo = path.resolve(__dirname, '../../..');
const examples = path.join(__dirname, 'authoring-examples');
const inputs = [];
function read(relative) {
  const data = fs.readFileSync(path.join(repo, relative));
  inputs.push({ path: relative, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') });
  return data.toString('utf8');
}
const checks = [];
function check(id, fn) { fn(); checks.push({ id, status: 'PASS_STATIC' }); }
function metadata(text) {
  const params = new Map(), commands = new Map();
  let current = null;
  for (const line of text.split('\n')) {
    const tag = line.match(/^ \* @(param|command|arg|text|type|default)(?: (.*))?$/);
    if (!tag) continue;
    const [, kind, value = ''] = tag;
    if (kind === 'param') { current = { args: [], name: value }; params.set(value, current); }
    else if (kind === 'command') { current = { args: [], name: value }; commands.set(value, current); }
    else if (kind === 'arg') { if (current) current.args.push(value); current = null; }
    else if (current) current[kind] = value;
  }
  return { params, commands };
}
const worldMetadata = metadata(read('src/plugins/PS_World.meta.txt'));
const manifest = JSON.parse(read('docs/step5/5.5/authoring-examples/manifest.json'));
check('S01-manifest-fixed-source-and-paths', () => {
  assert.equal(manifest.baseCommit, 'c7c9c15ea34948ecc1ca3d9fc4f60e39536fca2b');
  assert.equal(manifest.baseSourceTree, '9d830aecf027757396b1b0654d34fe112c9d9a0b');
  assert.equal(manifest.gCommands.plugin, 'PS_World');
  assert.equal(manifest.gCommands.status, 'INSTALLED_IN_FIXED_SOURCE_PENDING_FINAL_ACCEPTANCE');
  for (const name of [...manifest.copyToContentSource, manifest.appendByUniqueIdToGrants, ...manifest.apiDataOnly, manifest.gCommands.locationCommandExamples]) {
    assert.equal(typeof name, 'string');
    assert.ok(!name.startsWith('/') && !name.split('/').includes('..'));
    assert.ok(fs.statSync(path.join(examples, name)).isFile(), name);
  }
});
const parameters = JSON.parse(read('docs/step5/5.5/authoring-examples/native/PS_World.parameters.json'));
check('S02-changed-Flash-parameter-metadata-binding', () => {
  for (const [name, value] of Object.entries(parameters)) {
    assert.ok(worldMetadata.params.has(name), 'Unknown editor parameter: ' + name);
    assert.equal(typeof value, 'string', name);
  }
  const field = worldMetadata.params.get('FlashAnimationId');
  assert.equal(field.type, 'animation'); assert.equal(field.default, '40');
  assert.equal(parameters.FlashAnimationId, '40');
  assert.ok(Number.isSafeInteger(Number(parameters.FlashAnimationId)) && Number(parameters.FlashAnimationId) > 0);
});
const snippets = JSON.parse(read('docs/step5/5.5/authoring-examples/native/world-location-commands.json'));
const locations = { RecordRecentCenter: 'recordRecentCenter', RecordCaveEntrance: 'recordCaveEntrance', ClearCaveEscapePoint: 'clearCaveEscapePoint' };
const adapter = read('src/plugins/world/world-author-commands-mz.ts');
const flow = read('src/plugins/PS_BattleFlow.ts');
const application = read('src/framework/app/game-application.ts');
check('S03-three-independent-357-snippets-static-binding', () => {
  assert.deepEqual(Object.keys(snippets).sort(), Object.keys(locations).sort());
  assert.deepEqual(manifest.gCommands.locationCommands.sort(), Object.keys(locations).sort());
  for (const [name, method] of Object.entries(locations)) {
    const entry = snippets[name], declared = worldMetadata.commands.get(name);
    assert.ok(declared, name); assert.deepEqual(declared.args, []);
    assert.deepEqual(Object.keys(entry).sort(), ['code', 'indent', 'parameters']);
    assert.equal(entry.code, 357); assert.equal(entry.indent, 0);
    assert.deepEqual(entry.parameters, ['PS_World', name, declared.text, {}]);
    assert.ok(adapter.includes("['" + name + "', '" + method + "']"), name + ' registration pair');
    assert.ok(application.includes(method + '(): WorldLocationAuthoringOutcome'), method);
  }
  assert.ok(adapter.includes("Reflect.apply(register, manager, ['PS_World', command, handler])"));
  assert.ok(adapter.includes('args(raw, []);'));
  assert.ok(flow.includes('worldAuthor = installWorldAuthorCommandsMZ(G, () => PSFlow._app,'));
});
check('S04-guide-local-links', () => {
  const document = read('docs/step5/5.5/authoring.zh.md');
  for (const match of document.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const target = match[1].split('#')[0];
    if (!target || /^(https?:|mailto:)/.test(target)) continue;
    assert.ok(fs.existsSync(path.resolve(__dirname, target)), target);
  }
});
console.log(JSON.stringify({ scope: 'STATIC_ONLY_NO_PLUGIN_EXECUTION_NO_CONTENT_RECOMPILE', node: process.version,
  pid: process.pid, productRuntimeCases: 0, sourceReadOnly: true, checks, inputs }, null, 2));
