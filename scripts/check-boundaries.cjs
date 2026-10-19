'use strict';
/**
 * Import-boundary, `require` and cycle check for the framework sources (src/framework). Enforces what the module
 * READMEs only promise: rules never reach battle/flow/host, only the Showdown adapter touches Showdown, only one file
 * may use `require`, no MZ/DOM globals, no external packages, no import cycles.
 * Usage: node scripts/check-boundaries.cjs [frameworkDir]    (exit 1 on any violation)
 * scripts/tests/check-boundaries.test.cjs proves that every rule bites.
 */
const fs = require('fs');
const path = require('path');

// Which layers a layer may import (top-level directory names under the framework root).
const LAYERS = {
	rules: ['rules'],
	content: ['rules', 'content'],
	i18n: ['i18n'], // pure text tables and resolution; imports nothing
	battle: ['rules', 'battle'],
	flow: ['rules', 'content', 'battle', 'flow', 'i18n'],
	tools: ['rules', 'content', 'battle', 'flow', 'tools', 'i18n'],
	entry: ['rules', 'content', 'battle', 'flow', 'tools', 'i18n'], // files at the framework root (the public index only re-exports)
};
// Node built-ins a layer may import. Only tools (tests/fixtures/harness) may use the file system.
const NODE_BUILTINS = {
	rules: [], i18n: [], content: [], battle: ['node:path'], flow: [],
	tools: ['node:fs', 'node:os', 'node:path', 'node:crypto'], entry: [],
};
// Per-file additions to the layer's built-in list (the loader reads the pinned engine's SOURCE_SHA file).
const FILE_BUILTINS = { 'battle/showdown-loader.ts': ['node:fs'] };
// The only file allowed to use `require` (loads the pinned Showdown build at run time).
const REQUIRE_ALLOWED = new Set(['battle/showdown-loader.ts']);
// Files that may only be imported from inside their own layer.
const LAYER_PRIVATE = new Set(['battle/showdown-types.ts', 'battle/showdown-loader.ts', 'battle/custom-formats.ts']);
// The gateway's private state and its raw engine accessor. Only the battle layer (and tools/tests, which may diagnose)
// may name them; flow and everything else use the gateway's queries, operations and opaque checkpoint.
const GATEWAY_INTERNALS = new Set(['_debugBattle', '_env', '_queue', '_seq', '_closed', '_battle', '_waiters', '_opts']);
const MAY_USE_GATEWAY_INTERNALS = new Set(['battle', 'tools']);
// custom-formats runs INSIDE Showdown as its own bundle: it may only use plain rules and the Showdown type alias.
const CUSTOM_FORMATS_MAY = (rel) => rel.startsWith('rules/') || rel === 'battle/showdown-types.ts';
const HOST_GLOBALS = /\$game[A-Za-z]*|\$data[A-Za-z]*|\b(?:SceneManager|DataManager|StorageManager|Graphics|AudioManager|ConfigManager|PluginManager)\b|\b(?:Window|Scene|Sprite|Game)_[A-Za-z]+|\bwindow\b|\bdocument\b|\bnw\.|\bPIXI\b/;

function listTs(dir) {
	const out = [];
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) out.push(...listTs(p));
		else if (e.name.endsWith('.ts')) out.push(p);
	}
	return out;
}
const stripComments = t => t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:\\])\/\/.*$/gm, '$1');

// Source is read with the parser that ships with Vite (a dev dependency; the pinned TypeScript 7 has no JS compiler
// API). Parsing, not regular expressions, decides what is text (strings, template text, regex literals) and what is
// executable code, so `${require(...)}` inside a template is checked like any other expression.
let parseAst;
function loadParser() {
	if (parseAst) return parseAst;
	try { parseAst = require(require.resolve('vite', { paths: [path.join(__dirname, '..', 'src')] })).parseAst; } catch { /* reported below */ }
	if (typeof parseAst !== 'function') throw new Error('check-boundaries needs the parser from Vite: run "pnpm --dir src install --frozen-lockfile" first');
	return parseAst;
}
/** Module specifiers (import/export-from/import()/import type) and the source ranges that are NOT executable code. */
function scan(source) {
	const ast = loadParser()(source, { lang: 'ts' });
	const specs = [];
	const text = [];
	const names = new Set(); // every identifier, and string keys of computed member access (gw["_queue"])
	(function walk(n) {
		if (!n || typeof n !== 'object') return;
		if (Array.isArray(n)) { for (const c of n) walk(c); return; }
		switch (n.type) {
			case 'ImportDeclaration': case 'ExportAllDeclaration': case 'ExportNamedDeclaration':
				if (n.source && typeof n.source.value === 'string') specs.push(n.source.value);
				break;
			case 'ImportExpression':
				if (n.source && n.source.type === 'Literal' && typeof n.source.value === 'string') specs.push(n.source.value);
				break;
			case 'TSImportType': { // import("./x").T in a type position
				const lit = JSON.stringify(n.argument ?? n.source ?? null).match(/"value":"([^"]+)"/);
				if (lit) specs.push(lit[1]);
				break;
			}
			case 'Identifier': names.add(n.name); break;
			case 'MemberExpression': if (n.computed && n.property && n.property.type === 'Literal' && typeof n.property.value === 'string') names.add(n.property.value); break;
			case 'TemplateElement': text.push([n.start, n.end]); break;
			case 'Literal': if (typeof n.value === 'string' || n.regex) text.push([n.start, n.end]); break;
		}
		for (const k of Object.keys(n)) if (k !== 'type') { const v = n[k]; if (v && typeof v === 'object') walk(v); }
	})(ast);
	return { specs, text, names };
}
/** The source with strings, template text and regex literals blanked and comments removed; template `${}` code stays. */
function bareCode(source, ranges) {
	let out = '', at = 0;
	for (const [a, b] of [...ranges].sort((x, y) => x[0] - y[0])) {
		if (a < at) continue; // nested inside an already blanked range
		out += source.slice(at, a) + source.slice(a, b).replace(/[^\n]/g, ' ');
		at = b;
	}
	return stripComments(out + source.slice(at));
}

function check(root) {
	root = path.resolve(root);
	const files = listTs(root);
	const rels = new Map(files.map(f => [path.relative(root, f).split(path.sep).join('/'), f]));
	const violations = [];
	const edges = new Map();
	for (const [rel, abs] of rels) {
		const layer = rel.includes('/') ? rel.split('/')[0] : 'entry';
		const raw = fs.readFileSync(abs, 'utf8');
		if (!LAYERS[layer]) { violations.push(`${rel}: unknown layer "${layer}" (add it to LAYERS)`); continue; }
		let specs, bare, names;
		try { const sc = scan(raw); specs = sc.specs; names = sc.names; bare = bareCode(raw, sc.text); }
		catch (e) { if (/needs the parser/.test(e.message)) throw e; violations.push(`${rel}: cannot be parsed (${String(e.message).split('\n')[0]})`); continue; }
		// ---- gateway internals
		if (!MAY_USE_GATEWAY_INTERNALS.has(layer)) for (const n of names) if (GATEWAY_INTERNALS.has(n)) violations.push(`${rel}: gateway internal "${n}" may not be used in layer "${layer}" (use the gateway's queries, operations and checkpoint)`);
		// ---- imports
		for (const spec of specs) {
			if (spec.startsWith('node:')) {
				if (!NODE_BUILTINS[layer].includes(spec) && !(FILE_BUILTINS[rel] || []).includes(spec)) violations.push(`${rel}: layer "${layer}" may not import ${spec}`);
				continue;
			}
			if (!spec.startsWith('.')) { violations.push(`${rel}: external package "${spec}" (the framework has no dependencies)`); continue; }
			const target = path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec));
			if (!rels.has(target)) { violations.push(`${rel}: import "${spec}" does not resolve to a framework file`); continue; }
			const tlayer = target.includes('/') ? target.split('/')[0] : 'entry';
			if (!LAYERS[layer].includes(tlayer)) violations.push(`${rel}: layer "${layer}" may not import layer "${tlayer}" (${target})`);
			if (LAYER_PRIVATE.has(target) && tlayer !== layer) violations.push(`${rel}: ${target} is private to layer "${tlayer}"`);
			if (rel === 'battle/custom-formats.ts' && !CUSTOM_FORMATS_MAY(target)) violations.push(`${rel}: runs inside Showdown, may not import ${target}`);
			if (!edges.has(rel)) edges.set(rel, new Set());
			edges.get(rel).add(target);
		}
		// ---- require
		if (!REQUIRE_ALLOWED.has(rel) && /\brequire\b|\bcreateRequire\b|\bmodule\.require\b/.test(bare)) violations.push(`${rel}: "require" is only allowed in ${[...REQUIRE_ALLOWED].join(', ')}`);
		// ---- host globals
		if (layer !== 'tools') { const m = HOST_GLOBALS.exec(bare); if (m) violations.push(`${rel}: host/MZ/DOM global "${m[0]}" in layer "${layer}"`); }
	}
	// ---- cycles
	const state = new Map();
	const stack = [];
	const seen = new Set();
	function dfs(n) {
		state.set(n, 1); stack.push(n);
		for (const t of edges.get(n) || []) {
			if (state.get(t) === 1) {
				const cyc = [...stack.slice(stack.indexOf(t)), t].join(' -> ');
				if (!seen.has(cyc)) { seen.add(cyc); violations.push(`import cycle: ${cyc}`); }
			} else if (!state.get(t)) dfs(t);
		}
		stack.pop(); state.set(n, 2);
	}
	for (const n of rels.keys()) if (!state.get(n)) dfs(n);
	return { files: rels.size, violations };
}

module.exports = { check };

if (require.main === module) {
	const root = process.argv[2] || path.join(__dirname, '..', 'src', 'framework');
	const r = check(root);
	if (r.violations.length) { console.error(r.violations.join('\n')); console.error(`${r.violations.length} boundary violation(s) in ${r.files} files`); process.exit(1); }
	console.log(`boundaries ok: ${r.files} files`);
}
