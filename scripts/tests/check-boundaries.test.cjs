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

// ---- R2: production flow code may not reach the gateway's internals or the live engine object
test('flow, rules, content and i18n may not use the gateway internals or _debugBattle (member access, computed key, destructuring)', () => {
	for (const layer of ['flow', 'rules', 'content', 'i18n']) {
		const imports = layer === 'flow' ? 'import { g } from "../battle/gateway.ts";\n' : '';
		for (const body of [
			'export const f = (gw: any) => gw._debugBattle();',
			'export const f = (gw: any) => gw._queue.shift();',
			'export const f = (gw: any) => { gw._seq = 0; };',
			'export const f = (gw: any) => gw["_closed"];',
			'export const f = (gw: any) => { const { _env } = gw; return _env; };',
			'export const f = (gw: any) => `${gw._env.root}`;',
			'export const f = (gw: any) => gw._battle;',
		]) bad({ ...OK, [`${layer}/p.ts`]: imports + body + '\n' }, new RegExp(`${layer}/p\\.ts: .*gateway internal`));
	}
});
test('battle and tools may use the internals; mentioning the names in text or comments is fine', () => {
	clean({
		...OK,
		'battle/more.ts': 'export const f = (gw: any) => gw._queue.length + gw._seq;\n',
		'tools/t.ts': 'export const f = (gw: any) => gw._debugBattle();\n',
		'flow/doc.ts': '// gw._debugBattle() is for tools; gw._queue too\nexport const d = "gw._seq and _env are private";\nexport const e = `${1} gw._closed`;\n',
	});
});

// ---- core independence: no Node built-ins in rules, content, i18n or flow
test('the core (rules) and the other pure layers may not import any Node built-in, crypto included', () => {
	for (const layer of ['rules', 'content', 'i18n', 'flow']) {
		bad({ ...OK, [`${layer}/n.ts`]: 'import { createHash } from "node:crypto";\nexport const h = createHash;\n' }, new RegExp(`${layer}/n\\.ts: layer "${layer}" may not import node:crypto`));
	}
	clean({ ...OK, 'tools/n.ts': 'import { createHash } from "node:crypto";\nexport const h = createHash;\n' });
});

// ---- Node globals and explicit any
test('Node globals (process, Buffer, __dirname, __filename, global) are rejected outside battle and tools, also in templates and computed keys', () => {
	for (const layer of ['rules', 'content', 'i18n', 'flow']) {
		for (const body of ['export const a = process.platform;', 'export const a = Buffer.from("x");', 'export const a = __dirname;', 'export const a = `${process.env.X}`;', 'export const a = (global as unknown as Record<string, unknown>)["x"];']) {
			bad({ ...OK, [`${layer}/g.ts`]: body + '\n' }, new RegExp(`${layer}/g\\.ts: Node global "(process|Buffer|__dirname|global)" may not be used in layer "${layer}"`));
		}
	}
	clean({ ...OK, 'battle/g.ts': 'export const a = process.platform + __dirname;\n', 'tools/g.ts': 'export const a = Buffer.from("x");\n', 'rules/doc.ts': '// process.env and Buffer in a comment\nexport const a = "process.env Buffer";\n' });
});
test('explicit any is rejected in the core, not elsewhere, and unknown is fine', () => {
	bad({ ...OK, 'rules/a.ts': 'export const f = (x: any) => x;\n' }, /rules\/a\.ts: 1 explicit "any" in layer "rules"/);
	bad({ ...OK, 'rules/a.ts': 'export const f = (x: Record<string, any>, y: any[]) => [x, y];\n' }, /rules\/a\.ts: 2 explicit "any"/);
	clean({ ...OK, 'rules/a.ts': 'export const f = (x: unknown) => x;\n', 'battle/b.ts': 'export const f = (x: any) => x;\n', 'flow/c.ts': 'export const f = (x: any) => x;\n' });
});

// ---- the application layer
test('the application layer sees rules, content, the content runtime and i18n, never the engine adapters, tools or the composition root', () => {
	const flowFile = { 'flow/content-runtime.ts': 'export const f = 1;\n', 'tools/t.ts': 'export const t = 1;\n', 'content/c.ts': 'export const c = 1;\n', 'composition.ts': 'export const x = 1;\n' };
	clean({ ...OK, ...flowFile, 'app/a.ts': 'import { f } from "../flow/content-runtime.ts";\nimport { a } from "../rules/a.ts";\nimport { c } from "../content/c.ts";\nexport const v = [f, a, c];\n' });
	bad({ ...OK, ...flowFile, 'app/a.ts': 'import { g } from "../battle/gateway.ts";\nexport const v = g;\n' }, /layer "app" may not import layer "battle"/);
	bad({ ...OK, ...flowFile, 'app/a.ts': 'import { t } from "../tools/t.ts";\nexport const v = t;\n' }, /layer "app" may not import layer "tools"/);
	bad({ ...OK, ...flowFile, 'app/a.ts': 'import { x } from "../composition.ts";\nexport const v = x;\n' }, /layer "app" may not import layer "entry"/);
	bad({ ...OK, 'app/a.ts': 'import { readFileSync } from "node:fs";\nexport const v = readFileSync;\n' }, /layer "app" may not import node:fs/);
	bad({ ...OK, 'app/a.ts': 'export const v = (x: any) => x;\n' }, /app\/a\.ts: 1 explicit "any" in layer "app"/);
	bad({ ...OK, 'app/a.ts': 'export const v = (gw: { _queue: unknown[] }) => gw._queue;\n' }, /app\/a\.ts: gateway internal "_queue" may not be used in layer "app"/);
	clean({ ...OK, ...flowFile, 'composition.ts': 'import { g } from "./battle/gateway.ts";\nimport { a } from "./app/a.ts";\nexport const x = [g, a];\n', 'app/a.ts': 'export const a = 1;\n' });
});

test('app may only reach the host-free content runtime in flow, including re-exports and dynamic imports', () => {
	const flow = { 'flow/session.ts': 'export class BattleSession {}\n' };
	for (const code of ['import { BattleSession } from "../flow/session.ts";', 'export { BattleSession } from "../flow/session.ts";', 'export const load = () => import("../flow/session.ts");']) {
		bad({ ...OK, ...flow, 'app/a.ts': code }, /app.*may only import flow\/content-runtime\.ts/);
	}
	clean({ ...OK, 'flow/content-runtime.ts': 'export const content = 1;', 'app/a.ts': 'import { content } from "../flow/content-runtime.ts"; export const a = content;' });
});

test('the content-runtime exception cannot become an indirect engine bridge for app', () => {
	for (const target of ['battle/gateway.ts', 'flow/session.ts']) {
		bad({ ...OK, 'flow/session.ts': 'export const a = 1;', 'flow/content-runtime.ts': `import * as engine from "../${target}"; export { engine };` }, /flow\/content-runtime\.ts.*may only import rules\/content/);
	}
});

test('only the classified production, testing, legacy and composition entries are framework root entries', () => {
	bad({ ...OK, 'another-root.ts': 'import { g } from "./battle/gateway.ts"; export const engine = g;' }, /another-root\.ts.*root entry.*index\.ts.*composition\.ts/);
	clean({ ...OK,
		'index.ts': 'export { g } from "./battle/gateway.ts";',
		'production.ts': 'export { g } from "./battle/gateway.ts";',
		'testing.ts': 'export const tests = 1;',
		'composition.ts': 'import { g } from "./battle/gateway.ts"; export const wire = g;',
	});
});

test('the production entry cannot reach testing directly or through a production adapter', () => {
	const fixtures = { 'tools/fixtures/game.ts': 'export const fixture = 1;' };
	for (const files of [
		{ ...OK, ...fixtures, 'production.ts': 'export { fixture } from "./tools/fixtures/game.ts";' },
		{ ...OK, ...fixtures, 'production.ts': 'export { adapter } from "./tools/save-store.ts";', 'tools/save-store.ts': 'export { fixture as adapter } from "./fixtures/game.ts";' },
		{ ...OK, 'production.ts': 'export { tests } from "./testing.ts";', 'testing.ts': 'export const tests = 1;' },
	]) bad(files, /production\.ts: production dependency closure includes testing module/);
	bad({ ...OK, 'production.ts': 'export { g } from "./index.ts";', 'index.ts': 'export { g } from "./battle/gateway.ts";' }, /production\.ts: production entry may not depend on legacy index\.ts/);
	clean({ ...OK, ...fixtures, 'production.ts': 'export { adapter } from "./tools/save-store.ts";', 'tools/save-store.ts': 'export const adapter = 1;', 'testing.ts': 'export { fixture } from "./tools/fixtures/game.ts";' });
});

test('host-provided encoders, timers, scheduling and IO globals stay out of the pure layers', () => {
	for (const layer of ['rules', 'content', 'i18n', 'flow', 'app']) {
		for (const name of ['TextEncoder', 'TextDecoder', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'structuredClone', 'queueMicrotask', 'fetch', 'console', 'globalThis']) {
			bad({ ...OK, [`${layer}/a.ts`]: `export const a = ${name};` }, new RegExp(`Node global "${name}"`));
		}
	}
});

test('plain property keys and members do not name ambient globals, while shorthand and computed expressions do', () => {
	clean({ ...OK, 'app/a.ts': 'export const a = { process: 1, global: 2, TextEncoder: 3 }; export const b = a.process + a["global"]; export type Shape = { process: number; global: number }; export const f = (x: Shape) => x.global; export const method = { process() { return 1; } }; const { process: value } = a; export { value };' });
	bad({ ...OK, 'app/a.ts': 'export const a = { process };' }, /Node global "process"/);
	bad({ ...OK, 'app/a.ts': 'export const a = {}[process.platform];' }, /Node global "process"/);
});

test('nonliteral dynamic imports cannot bypass layer and built-in checks', () => {
	for (const expr of ['"node:" + name', '`node:${name}`', 'name']) {
		bad({ ...OK, 'app/a.ts': `export const load = (name: string) => import(${expr});` }, /dynamic import.*string literal/);
	}
});

// ---- Step 2: resolve every local module syntax to one canonical source identity before checking it.
test('extensionless files, directory indexes, re-exports, type imports and literal dynamic imports form a clean graph', () => {
	clean({
		'rules/a.ts': 'export type A = number; export const a = 1;\n',
		'rules/nested/index.ts': 'export { a as indexed } from "../a";\nexport type { A as IndexedA } from "../a";\n',
		'rules/b.ts': [
			'import { a } from "./a";',
			'import type { A } from "./a";',
			'import { indexed } from "./nested";',
			'import type { IndexedA } from "./nested";',
			'export { a as reexported } from "./a";',
			'export type ViaType = import("./a").A;',
			'export const load = () => import("./nested");',
			'export const b: [A, IndexedA, number] = [a, a, indexed];',
			'',
		].join('\n'),
		'battle/gateway.ts': 'import { b } from "../rules/b";\nexport const g = b;\n',
	});
});

const extensionlessLayerImports = [
	['import', 'import { g } from "../battle/gateway";\nexport const p = g;\n'],
	['re-export', 'export { g } from "../battle/gateway";\n'],
	['import type', 'import type { G } from "../battle/gateway";\nexport type P = G;\n'],
	['import type expression', 'export type P = import("../battle/gateway").G;\n'],
	['literal dynamic import', 'export const p = () => import("../battle/gateway");\n'],
];
for (const [name, code] of extensionlessLayerImports) {
	test(`extensionless ${name} cannot bypass layer checks`, () => {
		bad({ 'rules/a.ts': 'export const a = 1;\n', 'battle/gateway.ts': 'export type G = unknown; export const g = 1;\n', 'rules/p.ts': code }, /layer "rules" may not import layer "battle"/);
	});
}

test('directory index and re-export targets retain their actual layer identity', () => {
	bad({
		'rules/a.ts': 'export const a = 1;\n',
		'battle/index.ts': 'export { g } from "./gateway";\n',
		'battle/gateway.ts': 'export const g = 1;\n',
		'rules/p.ts': 'export { g } from "../battle";\n',
	}, /layer "rules" may not import layer "battle".*battle\/index\.ts/);
});

for (const [name, code] of [
	['import type', 'import type { X } from "../battle/showdown-types";\nexport type P = X;\n'],
	['type re-export', 'export type { X } from "../battle/showdown-types";\n'],
	['literal dynamic import', 'export const p = () => import("../battle/showdown-types");\n'],
]) {
	test(`extensionless ${name} cannot bypass private-path checks`, () => {
		bad({ ...OK, 'battle/showdown-types.ts': 'export type X = unknown;\n', 'flow/p.ts': code }, /battle\/showdown-types\.ts is private to layer "battle"/);
	});
}

test('the app content-runtime exception accepts only its canonical module with extensionless and type syntax', () => {
	clean({
		'flow/content-runtime.ts': 'export type C = number; export const content = 1;\n',
		'app/a.ts': 'import { content } from "../flow/content-runtime";\nimport type { C } from "../flow/content-runtime";\nexport type T = import("../flow/content-runtime").C;\nexport const a: C = content;\n',
	});
	for (const [name, target] of [
		['extensionless file', '../flow/session'],
		['directory index', '../flow'],
	]) {
		bad({
			'flow/index.ts': 'export { BattleSession } from "./session";\n',
			'flow/session.ts': 'export class BattleSession {}\n',
			'flow/content-runtime.ts': 'export const content = 1;\n',
			'app/a.ts': `export { BattleSession } from "${target}";\n`,
		}, new RegExp(`app may only import flow/content-runtime\\.ts.*${name === 'directory index' ? 'flow/index\\.ts' : 'flow/session\\.ts'}`));
	}
});

for (const [name, files] of [
	['extensionless files', {
		'rules/a.ts': 'import { b } from "./b";\nexport const a = b;\n',
		'rules/b.ts': 'import { a } from "./a";\nexport const b = a;\n',
	}],
	['directory index and re-export', {
		'rules/a.ts': 'export { b } from "./nested";\n',
		'rules/nested/index.ts': 'export { a } from "../a";\nexport const b = 1;\n',
	}],
	['type-only imports', {
		'rules/a.ts': 'import type { B } from "./b";\nexport type A = B;\n',
		'rules/b.ts': 'import type { A } from "./a";\nexport type B = A;\n',
	}],
]) {
	test(`cycles are checked on canonical module identities: ${name}`, () => {
		bad(files, /import cycle: rules\/.*\.ts -> rules\/.*\.ts/);
	});
}

test('every unresolved local module syntax is an explicit failure', () => {
	for (const code of [
		'import { x } from "./missing";\nexport const p = x;\n',
		'export { x } from "./missing";\n',
		'import type { X } from "./missing";\nexport type P = X;\n',
		'export type P = import("./missing").X;\n',
		'export const p = () => import("./missing-directory");\n',
	]) bad({ 'rules/a.ts': 'export const a = 1;\n', 'rules/p.ts': code }, /rules\/p\.ts: import ".*" does not resolve/);
});
