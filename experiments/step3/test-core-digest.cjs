'use strict';
// The portable SHA-256 must equal node:crypto for everything the framework hashes, and the identities that already
// exist (old ledger entries, compiled-content inputs hashes) must not change.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const E = require('../../js/engine/build/engine.cjs');
const golden = require('./fixtures/result-hash-golden.json');
const { sha256Hex, utf8Bytes } = E.digest;
const ref = s => crypto.createHash('sha256').update(s).digest('hex');

test('FIPS 180-4 / NIST vectors', () => {
  assert.equal(sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'), '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  assert.equal(sha256Hex('a'.repeat(1_000_000)), 'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0');
});

test('every length around the block and padding boundaries equals node:crypto', () => {
  for (let n = 0; n <= 200; n++) { const s = 'x'.repeat(n); assert.equal(sha256Hex(s), ref(s), `length ${n}`); }
  for (const n of [1000, 4095, 4096, 4097, 65535, 65536]) { const s = 'ab'.repeat(n / 2) + (n % 2 ? 'c' : ''); assert.equal(sha256Hex(s), ref(s), `length ${n}`); }
});

test('UTF-8 encoding: BMP, astral and unpaired surrogates equal the platform (unpaired -> U+FFFD)', () => {
  const cases = ['é', '波波', '😀', 'a😀b', '\u{10ffff}', '\ud800', '\udc00', 'x\ud800y', '\udbffA', '\ud83d', '😀\ud83d', '\u0000', '\u007f\u0080߿ࠀ￿'];
  for (const s of cases) {
    assert.equal(sha256Hex(s), ref(s), JSON.stringify(s));
    assert.deepEqual([...utf8Bytes(s)], [...Buffer.from(s, 'utf8')], 'bytes ' + JSON.stringify(s));
  }
});

test('seeded random strings (mixed scripts, surrogates, controls) equal node:crypto', () => {
  let x = 123456789; const rnd = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x; };
  for (let k = 0; k < 400; k++) {
    let s = ''; const len = rnd() % 300;
    for (let i = 0; i < len; i++) { const kind = rnd() % 6; s += kind === 0 ? String.fromCharCode(rnd() % 128) : kind === 1 ? String.fromCharCode(0x80 + (rnd() % 0x780)) : kind === 2 ? String.fromCharCode(0x800 + (rnd() % 0xd000)) : kind === 3 ? String.fromCodePoint(0x10000 + (rnd() % 0xfffff)) : kind === 4 ? String.fromCharCode(0xd800 + (rnd() % 0x800)) : '{}[]":,'[rnd() % 7]; }
    assert.equal(sha256Hex(s), ref(s), `case ${k}`);
  }
});

test('result identities that existed before the change are reproduced (golden vectors from the node:crypto implementation)', () => {
  assert.ok(golden.entries.length >= 8);
  for (const e of golden.entries) assert.equal(E.state.resultHash(e.result), e.hash, e.name);
  // the key order of the object never matters; the content does
  const a = golden.entries.find(e => e.name === 'caught with master ball'), rev = golden.entries.find(e => /reverse insertion order/.test(e.name));
  assert.equal(rev.hash, a.hash); assert.equal(E.state.resultHash(rev.result), a.hash);
  const changed = JSON.parse(JSON.stringify(a.result)); changed.bag = { ...changed.bag, potion: 1 };
  assert.notEqual(E.state.resultHash(changed), a.hash);
});

test('old ledgers keep working: a result recorded earlier is still recognised, a different one with the same id still conflicts', () => {
  const entry = golden.entries.find(e => e.name === 'wild run');
  const game = E.fixtures.makeGame();
  game.appliedBattles = { [entry.result.battleId]: { hash: entry.hash } }; // a ledger written before the change (same shape as experiments/step3/fixtures/legacy-v1-flow-state.json)
  assert.equal(E.state.applyBattleResult(game, entry.result).status, 'already-applied');
  const other = JSON.parse(JSON.stringify(entry.result)); other.outcome = { ...other.outcome, kind: 'win' };
  assert.throws(() => E.state.applyBattleResult(game, other), /already applied with a different result/);
});

test('the compiled-content input hash is unchanged by the portable implementation', () => {
  const fs = require('node:fs'); const path = require('node:path');
  const SRC = path.resolve(__dirname, '../../content/sample'); const read = f => JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8'));
  const r = E.contentCompile.compileContent({ manifest: read('manifest.json'), sources: read('sources.json'), species: read('species.json'), overlays: read('overlays.json') });
  assert.equal(r.data.inputsHash, 'c322d83047dc4c5b09823384d0250b6ccc8e89b7bb7e2e2875b8fde94f2b6625');
});
