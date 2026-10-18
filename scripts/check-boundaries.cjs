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
	battle: ['rules', 'battle'],
	flow: ['rules', 'content', 'battle', 'flow'],
	tools: ['rules', 'content', 'battle', 'flow', 'tools'],
	entry: ['rules', 'content', 'battle', 'flow', 'tools'], // files at the framework root (the public index only re-exports)
};
// Node built-ins a layer may import. Only tools (tests/fixtures/harness) may use the file system.
const NODE_BUILTINS = {
	rules: ['node:crypto'], content: [], battle: ['node:path'], flow: [],
	tools: ['node:fs', 'node:os', 'node:path', 'node:crypto'], entry: [],
};
// The only file allowed to use `require` (loads the pinned Showdown build at run time).
const REQUIRE_ALLOWED = new Set(['battle/showdown-loader.ts']);
// Files that may only be imported from inside their own layer.
const LAYER_PRIVATE = new Set(['battle/showdown-types.ts', 'battle/showdown-loader.ts', 'battle/custom-formats.ts']);
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
const stripStrings = t => t.replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g, '""');

function check(root) {
	root = path.resolve(root);
	const files = listTs(root);
	const rels = new Map(files.map(f => [path.relative(root, f).split(path.sep).join('/'), f]));
	const violations = [];
	const edges = new Map();
	for (const [rel, abs] of rels) {
		const layer = rel.includes('/') ? rel.split('/')[0] : 'entry';
		const raw = fs.readFileSync(abs, 'utf8');
		const code = stripComments(raw);
		const bare = stripStrings(code);
		if (!LAYERS[layer]) { violations.push(`${rel}: unknown layer "${layer}" (add it to LAYERS)`); continue; }
		// ---- imports
		const specs = [];
		for (const m of code.matchAll(/\b(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?["']([^"']+)["']/g)) specs.push(m[1]);
		for (const m of code.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) specs.push(m[1]);
		for (const spec of specs) {
			if (spec.startsWith('node:')) {
				if (!NODE_BUILTINS[layer].includes(spec)) violations.push(`${rel}: layer "${layer}" may not import ${spec}`);
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
