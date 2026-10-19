'use strict';
// Proves that the boundary checker bites: every rule is exercised with a deliberately violating tree, and the real
// framework tree must be clean. A checker that cannot fail would be configuration theatre.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { check } = require('../check-boundaries.cjs');

function tree(files) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-bound-'));
	for (const [rel, text] of Object.entries(files)) {
		fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
		fs.writeFileSync(path.join(dir, rel), text);
	}
	return dir;
}
const bad = (files, re) => {
	const dir = tree(files);
	try {
		const r = check(dir);
		assert.ok(r.violations.some(v => re.test(v)), `expected a violation matching ${re}, got: ${JSON.stringify(r.violations)}`);
	} finally { fs.rmSync(dir, { recursive: true, force: true }); }
};

const OK = { 'rules/a.ts': 'export const a = 1;\n', 'battle/gateway.ts': 'import { a } from "../rules/a.ts";\nexport const g = a;\n' };

test('a clean tree passes', () => {
	const dir = tree(OK);
	try { assert.deepEqual(check(dir).violations, []); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('the real framework tree is clean', () => {
	const r = check(path.join(__dirname, '..', '..', 'src', 'framework'));
	assert.deepEqual(r.violations, []);
	assert.ok(r.files > 10);
});
test('rules may not import battle or flow', () => {
	bad({ ...OK, 'rules/b.ts': 'import { g } from "../battle/gateway.ts";\nexport const b = g;\n' }, /layer "rules" may not import layer "battle"/);
});
test('battle may not import flow', () => {
	bad({ ...OK, 'flow/s.ts': 'export const s = 1;\n', 'battle/x.ts': 'import { s } from "../flow/s.ts";\nexport const x = s;\n' }, /layer "battle" may not import layer "flow"/);
});
test('require is only allowed in the Showdown loader', () => {
	bad({ ...OK, 'flow/s.ts': 'const r = require("./x");\nexport const s = r;\n' }, /"require" is only allowed in/);
	bad({ ...OK, 'flow/s.ts': 'import { createRequire } from "node:module";\nexport const s = createRequire;\n' }, /may not import node:module|"require" is only allowed/);
});
test('the loader may use require', () => {
	const dir = tree({ ...OK, 'battle/showdown-loader.ts': 'const nodeRequire = require;\nexport const l = nodeRequire;\n' });
	try { assert.deepEqual(check(dir).violations, []); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('Showdown types stay inside battle', () => {
	bad({ ...OK, 'battle/showdown-types.ts': 'export type X = any;\n', 'flow/s.ts': 'import type { X } from "../battle/showdown-types.ts";\nexport type S = X;\n' }, /private to layer "battle"/);
});
test('custom-formats runs inside Showdown: only rules and the type alias', () => {
	bad({ ...OK, 'battle/showdown-types.ts': 'export type X = any;\n', 'battle/custom-formats.ts': 'import { g } from "./gateway.ts";\nexport const f = g;\n' }, /runs inside Showdown/);
});
test('only the listed file may add node:fs to the battle layer', () => {
	bad({ ...OK, 'battle/x.ts': 'import fs from "node:fs";\nexport const x = fs;\n' }, /layer "battle" may not import node:fs/);
	const dir = tree({ ...OK, 'battle/showdown-loader.ts': 'import fs from "node:fs";\nexport const x = fs;\n' });
	try { assert.deepEqual(check(dir).violations, []); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('external packages and wrong node built-ins are refused', () => {
	bad({ ...OK, 'rules/b.ts': 'import x from "lodash";\nexport const b = x;\n' }, /external package "lodash"/);
	bad({ ...OK, 'rules/b.ts': 'import fs from "node:fs";\nexport const b = fs;\n' }, /layer "rules" may not import node:fs/);
});
test('host and DOM globals are refused outside tools', () => {
	bad({ ...OK, 'rules/b.ts': 'export const b = $gameSystem;\n' }, /host\/MZ\/DOM global/);
	bad({ ...OK, 'flow/s.ts': 'export const s = window.location;\n' }, /host\/MZ\/DOM global "window"/);
});
test('mentions in comments and strings do not count', () => {
	const dir = tree({ ...OK, 'rules/b.ts': '// uses require( and window in prose\nexport const b = "SceneManager require(";\n' });
	try { assert.deepEqual(check(dir).violations, []); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('import cycles are found', () => {
	bad({ 'rules/a.ts': 'import { b } from "./b.ts";\nexport const a = b;\n', 'rules/b.ts': 'import { a } from "./a.ts";\nexport const b = a;\n' }, /import cycle/);
});
test('unresolvable relative imports are reported', () => {
	bad({ ...OK, 'rules/b.ts': 'import { z } from "./missing.ts";\nexport const b = z;\n' }, /does not resolve/);
});

// ---- R3: executable code inside template literals is checked; plain text is not
const clean = (files) => {
	const dir = tree(files);
	try { assert.deepEqual(check(dir).violations, []); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
};
test('a require inside a template interpolation is rejected like a direct require', () => {
	bad({ ...OK, 'rules/p.ts': 'export const p = `${require("node:fs").existsSync(".")}`;\n' }, /rules\/p\.ts: "require" is only allowed/);
	bad({ ...OK, 'rules/p.ts': 'export const p = `x ${(0, require)("node:fs")} y`;\n' }, /"require" is only allowed/);
	bad({ ...OK, 'rules/p.ts': 'export const p = `${createRequire(import.meta.url)}`;\n' }, /"require" is only allowed/);
});
test('host globals inside template interpolations are rejected, also in nested templates', () => {
	bad({ ...OK, 'rules/p.ts': 'export const p = `${(globalThis as any).$gameSystem}`;\n' }, /host\/MZ\/DOM global "\$gameSystem" in layer "rules"/);
	bad({ ...OK, 'flow/p.ts': 'export const p = `a ${`b ${window.innerWidth}`} c`;\n' }, /host\/MZ\/DOM global "window" in layer "flow"/);
	bad({ ...OK, 'rules/p.ts': 'export const p = `${`${`${require("node:os")}`}`}`;\n' }, /"require" is only allowed/);
});
test('text that merely mentions require, window or import is not code: strings, templates, regex literals and comments', () => {
	clean({
		...OK,
		'rules/p.ts': [
			'// require("node:fs") and window and $gameSystem in a comment',
			'/* import x from "../battle/gateway.ts"; require("x") */',
			'export const a = "require(\\"node:fs\\") window $gameSystem";',
			"export const b = 'import x from \"../battle/gateway.ts\"';",
			'export const c = `use require("x") and window; import y from "../battle/gateway.ts"`;',
			'export const d = /require\\(|window|\\/\\/ not a comment/;',
			'export const e = `${a.length} chars of text, then window text ${b.length}`;',
			'',
		].join('\n'),
	});
});
test('a template literal does not hide the code after it from the import and require checks', () => {
	bad({ ...OK, 'rules/p.ts': 'export const t = `plain`;\nimport { g } from "../battle/gateway.ts";\nexport const x = g;\n' }, /layer "rules" may not import layer "battle"/);
	bad({ ...OK, 'rules/p.ts': 'export const t = `plain ${1}`; export const r = require("node:fs");\n' }, /"require" is only allowed/);
});
test('type-position and dynamic imports are still resolved; an unparsable file is reported, not skipped', () => {
	bad({ ...OK, 'rules/p.ts': 'export type G = import("../battle/gateway.ts").X;\n' }, /layer "rules" may not import layer "battle"/);
	bad({ ...OK, 'rules/p.ts': 'export const g = () => import("../battle/gateway.ts");\n' }, /layer "rules" may not import layer "battle"/);
	bad({ ...OK, 'rules/p.ts': 'export const = ;\n' }, /rules\/p\.ts: cannot be parsed/);
});
