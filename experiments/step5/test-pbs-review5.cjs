'use strict';
// R04/R05 (ca879273 review): synthetic author PBS input; WP04 §4.2 and WP03 §5.3.
// A report's species list contains only accepted records, including when the overall import fails.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { importPbsSpecies } = require('../../js/engine/build/engine.cjs').pbsImport;

const ROOT = path.resolve(__dirname, '../..');
const FIELDS = ['GrowthRate = Medium', 'BaseExp = 51', 'EVs = SPEED,1', 'Moves = 1,TACKLE'];
const record = (name, fields = FIELDS) => [`[${name}]`, ...fields];
const read = lines => importPbsSpecies(lines.join('\n'), 'author-placeholder');

function locatedFailure(result, line, field, message) {
  assert.equal(result.ok, false, 'invalid author input must fail the import');
  assert.ok(result.errors.some(e => e.line === line && e.path === field && message.test(e.message)), JSON.stringify(result.errors));
}

test('R04: an invalid raw move token is rejected at Moves, never cleaned into another move', () => {
  for (const token of ['TAC!KLE', 'TAC KLE', 'TACKLE!', '1TACKLE']) {
    const lines = record('RATTATA', [...FIELDS.slice(0, 3), `Moves = 1,${token}`]);
    const r = read(lines);
    locatedFailure(r, 5, '[RATTATA].Moves', /move id/);
    assert.deepEqual(r.species, [], token);
  }
});

test('R04: explicit empty EVs must contain a required pair and cannot become an empty yield', () => {
  for (const field of ['EVs =', 'EVs =   # no pair supplied']) {
    const r = read(record('RATTATA', [FIELDS[0], FIELDS[1], field, FIELDS[3]]));
    locatedFailure(r, 4, '[RATTATA].EVs', /pairs of STAT,amount/);
    assert.deepEqual(r.species, [], field);
  }
});

test('R04: legal symbols keep underscore conversion, EV enum mapping, and the CatchRate default', () => {
  const r = read(record('MR_MIME', [
    'GrowthRate = Parabolic', 'BaseExp = 51', 'EVs = SPECIAL_ATTACK,2,SPEED,1',
    'Moves = 1,QUICK_ATTACK,7,TACKLE',
  ]));
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.deepEqual(r.species, [{
    id: 'mr-mime', showdownId: 'mrmime', nameKey: 'species.mr_mime', growth: 'parabolic', baseExp: 51,
    evYield: { spa: 2, spe: 1 }, catchRate: 255,
    learnset: [{ level: 1, move: 'quickattack' }, { level: 7, move: 'tackle' }], source: 'author-placeholder',
  }]);
  assert.deepEqual(r.records[0].defaults, ['CatchRate = 255 (WP03 §4.3 class default)']);
});

const PARSE_ERRORS = [
  ['property syntax', 'not a property', '', /invalid property syntax/],
  ['quoted value', 'Name = "Rat"', '.Name', /quoted values are outside this import subset/],
  ['indented comment', ' # indented comment', '', /indented comment is not a comment/],
];

for (const [label, badLine, suffix, message] of PARSE_ERRORS) {
  test(`R05: ${label} invalidates complete B, preserves A/C, and later valid fields cannot clear it`, () => {
    for (const errorFirst of [false, true]) {
      const before = record('PIDGEY');
      const middle = record('RATTATA', errorFirst ? [badLine, ...FIELDS, 'Name = Rat'] : [...FIELDS, badLine, 'Name = Rat']);
      const lines = [...before, ...middle, ...record('SPEAROW')];
      const r = read(lines);
      locatedFailure(r, lines.indexOf(badLine) + 1, `[RATTATA]${suffix}`, message);
      assert.equal(r.errors.length, 1, 'the error stays located without affecting the neighboring records');
      assert.deepEqual(r.species.map(s => s.id), ['pidgey', 'spearow'], `errorFirst=${errorFirst}`);
      assert.deepEqual(r.species, read([...record('PIDGEY'), ...record('SPEAROW')]).species);
    }
  });
}

test('R05: several parse errors retain their own locations and a valid property override does not repair the section', () => {
  const lines = [...record('RATTATA'), 'not a property', 'Name = "Rat"', ' # bad comment', ...FIELDS];
  const r = read(lines);
  assert.equal(r.ok, false);
  assert.deepEqual(r.species, []);
  assert.deepEqual(r.errors.map(e => [e.line, e.path]), [[6, '[RATTATA]'], [7, '[RATTATA].Name'], [8, '[RATTATA]']]);
});

test('R05: physical comments, blank lines, trailing comments, and legal repeated fields remain valid', () => {
  const r = read(['# initial comment', '', '[RATTATA]', '# section comment', '  ', ...FIELDS,
    'Name = Rat # trailing comment', 'GrowthRate = Fast', 'CatchRate = 42']);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.species[0].growth, 'fast');
  assert.equal(r.species[0].catchRate, 42);
  assert.deepEqual(r.records[0].overridden, ['GrowthRate']);
  assert.deepEqual(r.records[0].showdown, ['Name']);
});

test('R04/R05 CLI: failed imports write a report containing only valid records and preserve the diagnostic line', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-pbs-review5-'));
  try {
    const src = path.join(dir, 'src');
    fs.cpSync(path.join(ROOT, 'content/sample'), src, { recursive: true });
    const file = path.join(dir, 'pokemon.txt'), report = path.join(dir, 'report.json');
    const cases = [
      ['R04 move', [...FIELDS.slice(0, 3), 'Moves = 1,TAC!KLE'], 'Moves = 1,TAC!KLE', '.Moves', /move id/],
      ['R04 EVs', [FIELDS[0], FIELDS[1], 'EVs =', FIELDS[3]], 'EVs =', '.EVs', /pairs of STAT,amount/],
      ...PARSE_ERRORS.map(([label, line, suffix, message]) => [`R05 ${label}`, [...FIELDS, line, 'Name = Rat'], line, suffix, message]),
    ];
    for (const [label, fields, badLine, suffix, message] of cases) {
      const lines = [...record('PIDGEY'), ...record('RATTATA', fields), ...record('SPEAROW')];
      fs.writeFileSync(file, lines.join('\n'));
      const proc = spawnSync(process.execPath, [path.join(ROOT, 'js/engine/build/content-cli.cjs'), 'import-pbs',
        `--src=${src}`, `--file=${file}`, '--source=author-placeholder', `--report=${report}`], { encoding: 'utf8' });
      assert.equal(proc.status, 1, `${label}: ${proc.stdout}\n${proc.stderr}`);
      const r = JSON.parse(fs.readFileSync(report, 'utf8'));
      locatedFailure(r, lines.indexOf(badLine) + 1, `[RATTATA]${suffix}`, message);
      assert.deepEqual(r.species.map(s => s.id), ['pidgey', 'spearow'], label);
      assert.ok(proc.stderr.includes(`pokemon.txt:${lines.indexOf(badLine) + 1} [RATTATA]${suffix}:`), proc.stderr);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
