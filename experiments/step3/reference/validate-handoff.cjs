'use strict';
// Mechanical check of a growth-cases handoff file against growth-cases.schema.json (no dependencies).
// Run by the OBSERVATION side before anything is handed over, and again by the implementation side on receipt.
// Usage: node validate-handoff.cjs <growth-cases.json> [<decision-record.md>]
const fs = require('fs');
const path = require('path');
const schema = JSON.parse(fs.readFileSync(path.join(__dirname, 'growth-cases.schema.json'), 'utf8'));
const errors = [];
const err = (p, m) => errors.push(`${p}: ${m}`);

function check(v, s, p) {
	if (s.$ref) { const name = s.$ref.split('/').pop(); return check(v, schema.definitions[name], p); }
	if ('const' in s && v !== s.const) return err(p, `must equal ${JSON.stringify(s.const)}`);
	if (s.enum && !s.enum.includes(v)) return err(p, `must be one of ${s.enum.join('|')}`);
	if (s.type) {
		const types = Array.isArray(s.type) ? s.type : [s.type];
		const t = v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v;
		const ok = types.some(x => x === t || (x === 'number' && (t === 'integer' || t === 'number')));
		if (!ok) return err(p, `type ${t} not in ${types.join('|')}`);
	}
	if (typeof v === 'string') {
		if (s.maxLength !== undefined && v.length > s.maxLength) err(p, `longer than ${s.maxLength}`);
		if (s.pattern && !new RegExp(s.pattern).test(v)) err(p, `does not match ${s.pattern}`);
		if (/[\r\n\t`{};$\\]/.test(v) && !(s.pattern && s.pattern.includes('\\\\'))) err(p, 'contains a character that is not allowed in free text');
	}
	if (typeof v === 'number') {
		if (s.minimum !== undefined && v < s.minimum) err(p, `below ${s.minimum}`);
		if (s.maximum !== undefined && v > s.maximum) err(p, `above ${s.maximum}`);
	}
	if (Array.isArray(v)) {
		if (s.minItems && v.length < s.minItems) err(p, `needs at least ${s.minItems} items`);
		if (s.items) v.forEach((x, i) => check(x, s.items, `${p}[${i}]`));
	}
	if (v && typeof v === 'object' && !Array.isArray(v)) {
		for (const k of s.required || []) if (!(k in v)) err(p, `missing ${k}`);
		for (const k of Object.keys(v)) {
			if (s.properties && k in s.properties) check(v[k], s.properties[k], `${p}.${k}`);
			else if (s.additionalProperties === false) err(p, `unknown field ${k}`);
		}
	}
}

const file = process.argv[2];
if (!file) { console.error('usage: node validate-handoff.cjs <growth-cases.json> [<decision-record.md>]'); process.exit(2); }
let data;
try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { console.error('not valid JSON: ' + e.message); process.exit(1); }
check(data, schema, '$');
const ids = new Set();
for (const c of data.cases || []) { if (ids.has(c.id)) err('$.cases', `duplicate id ${c.id}`); ids.add(c.id); }
for (const c of data.cases || []) {
	if (!c.result) continue;
	if (c.result.outcome === 'value' && !Number.isInteger(c.result.value)) err(c.id, 'outcome value needs an integer value');
	if (c.result.outcome !== 'value' && ('value' in c.result)) err(c.id, 'only outcome value may carry a value');
	if (c.result.outcome !== 'value' && !c.result.errorClass) err(c.id, 'error outcomes need errorClass');
}
const rec = process.argv[3];
if (rec) {
	const t = fs.readFileSync(rec, 'utf8');
	if (t.length > 6000) err(rec, 'decision record longer than 6000 characters');
	if (/```/.test(t)) err(rec, 'code fences are not allowed in the decision record');
	if (/^\s*(def|end|class|module|require|begin|rescue|elsif|unless)\b/m.test(t)) err(rec, 'looks like source code (auxiliary check only)');
}
if (errors.length) { console.error(errors.slice(0, 40).join('\n')); console.error(`${errors.length} problem(s)`); process.exit(1); }
console.log(`ok: ${data.cases.length} cases`);
