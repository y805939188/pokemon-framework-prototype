'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {E, world, clone} = require('./contracts/fixtures.cjs');
const vectors = require('./contracts/value-semantics-vectors.json').vectors;
const vector = id => vectors.find(entry => entry.id === id);
const rawResult = () => clone(vector('synthetic-frozen-v1-result').value);

// Expected strings/bytes/hashes are fixed data. Neither this suite nor its
// Python check reimplements sorting, traversal or number serialization.
for (const entry of vectors) test('VS01 fixed canonical JSON/UTF-8/SHA-256 vector: ' + entry.id, () => {
  const bytes = Buffer.from(entry.canonicalJSON, 'utf8');
  assert.equal(bytes.toString('hex'), entry.utf8Hex);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), entry.sha256);
  assert.equal(E.semantic.semanticFingerprint(entry.value), entry.sha256);
  if (entry.validBattleResult) assert.equal(E.state.resultHash(entry.value), entry.sha256);
});

test('VS02 Python independently verifies the fixed canonical strings and bytes without canonicalizing values', () => {
  const script = `import hashlib,json,sys
with open(sys.argv[1],encoding="utf-8") as source:
    vectors=json.load(source)["vectors"]
for vector in vectors:
    encoded=vector["canonicalJSON"].encode("utf-8")
    assert encoded.hex()==vector["utf8Hex"],vector["id"]
    assert hashlib.sha256(encoded).hexdigest()==vector["sha256"],vector["id"]
print(len(vectors))
`;
  const result = spawnSync('python3', ['-c', script, path.join(__dirname, 'contracts/value-semantics-vectors.json')], {encoding: 'utf8'});
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.stdout.trim(), '12');
});

test('VS03 dictionary order is irrelevant while array order, null presence and Unicode normalization remain distinct', () => {
  assert.equal(E.semantic.semanticFingerprint({a: {a: 1, z: 2}, z: 0}), vector('nested-dictionaries').sha256);
  for (const [a, b] of [['absent', 'explicit-null'], ['array-forward', 'array-reverse'], ['unicode-nfc-preserved', 'unicode-nfd-preserved']]) {
    assert.notEqual(vector(a).sha256, vector(b).sha256);
  }
  assert.notEqual(E.semantic.semanticFingerprint({nonce: '0007'}), E.semantic.semanticFingerprint({nonce: 7}));
  assert.equal(E.semantic.semanticFingerprint({zero: -0}), E.semantic.semanticFingerprint({zero: 0}));
});

test('VS04 raw result serializer coercions never grant semantic or domain validity', () => {
  const base = rawResult(), omitted = vector('synthetic-frozen-v1-result').sha256;
  const presentUndefined = {...base, money: undefined}, presentNull = {...base, money: null};
  assert.equal(E.state.resultHash(presentUndefined), omitted, 'legacy JSON serializer omits undefined object fields');
  assert.notEqual(E.state.resultHash(presentNull), omitted);
  assert.equal(E.state.resultHash({...base, money: NaN}), E.state.resultHash(presentNull), 'legacy JSON serializer maps nonfinite numbers to null');
  assert.throws(() => E.semantic.semanticFingerprint(presentUndefined), /invalid-intent-value/);
  assert.throws(() => E.semantic.semanticFingerprint({...base, money: NaN}), /invalid-intent-number/);
  assert.equal(E.semantic.semanticFingerprint(presentNull), E.state.resultHash(presentNull), 'plain JSON has the same bytes, but null money remains domain-invalid');
  assert.throws(() => E.semantic.semanticFingerprint([undefined]), /invalid-intent-value/);
  assert.throws(() => E.semantic.semanticFingerprint(Array(1)), /invalid-intent-value/);
});

test('VS05 numeric domain validation precedes an exact replay shortcut, even when a low-level hash exists', () => {
  const w = world();
  for (const value of [undefined, null, '1', 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, Number.MIN_SAFE_INTEGER - 1]) {
    const raw = {...rawResult(), money: value}, state = clone(w.state.read());
    // A forged matching ledger must not turn an invalid result into an exact replay.
    state.appliedBattles[raw.battleId] = {hash: E.state.resultHash(raw)};
    const before = clone(state);
    assert.throws(() => E.state.applyBattleResult(state, raw), /invalid battle result \$\.money: expected a safe integer/);
    assert.deepEqual(state, before);
  }
  for (const value of [1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.match(E.semantic.semanticFingerprint({money: value}), /^[a-f0-9]{64}$/, 'finite generic intent number is hashable');
  }
  const state = clone(w.state.read()); state.money = 0;
  assert.equal(E.state.applyBattleResult(state, {...rawResult(), money: Number.MAX_SAFE_INTEGER}).status, 'applied');
});

test('VS06 nullable save fields use explicit unknown values, and integer bounds remain field-specific', () => {
  const w = world(), base = clone(w.state.read());
  base.party[0].origin.map = null; base.party[0].statNature = null;
  assert.deepEqual(E.saveSchema.validateGame(base), []);
  for (const field of ['origin.map', 'statNature']) {
    const missing = clone(base);
    if (field === 'origin.map') delete missing.party[0].origin.map;
    else delete missing.party[0].statNature;
    assert(E.saveSchema.validateGame(missing).some(problem => problem.path.endsWith(field)), field);
  }
  for (const money of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert(E.saveSchema.validateGame({...base, money}).some(problem => problem.path === '$.money'));
  }
  assert.deepEqual(E.saveSchema.validateGame({...base, money: Number.MAX_SAFE_INTEGER}), []);
});

test('VS07 member ordinals remain exact canonical decimal strings above the numeric safe-integer range', () => {
  const result = E.memberIdentity.allocateMemberId('9007199254740993', new Set());
  assert.equal(result.nextMemberOrdinal, '9007199254740994');
  assert.equal(E.memberIdentity.advanceMemberOrdinal('9007199254740993', [], '9007199254740994'), '9007199254740994');
  for (const value of ['0', '01', '+1', '-1', '1.0', '1e3', ' 1', '1 ']) {
    assert.throws(() => E.memberIdentity.allocateMemberId(value, new Set()), /positive canonical decimal integer/);
  }
  const w = world(), state = clone(w.state.read()); state.nextMemberOrdinal = '9007199254740993';
  assert.deepEqual(E.saveSchema.validateGame(state), []);
  assert(E.saveSchema.validateGame({...state, nextMemberOrdinal: 9007199254740992}).some(problem => problem.path === '$.nextMemberOrdinal'));
});
