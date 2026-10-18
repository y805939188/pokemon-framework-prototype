'use strict';
// Compare two V8 heap snapshots by (type:name): count and self-size growth.
// Usage: node --max-old-space-size=8192 scripts/heap-diff.cjs a.heapsnapshot b.heapsnapshot [top]
const fs = require('fs');
function load(file) {
	const snap = JSON.parse(fs.readFileSync(file, 'utf8'));
	const { node_fields: nf, node_types: nt } = snap.snapshot.meta; const N = nf.length;
	const iT = nf.indexOf('type'), iN = nf.indexOf('name'), iS = nf.indexOf('self_size');
	const m = new Map();
	for (let i = 0; i < snap.nodes.length; i += N) {
		const t = nt[0][snap.nodes[i + iT]]; if (t === 'string' || t === 'concatenated string' || t === 'sliced string' || t === 'number' || t === 'hidden' || t === 'array' || t === 'code' || t === 'synthetic') continue;
		const k = t + ':' + snap.strings[snap.nodes[i + iN]].slice(0, 80);
		const o = m.get(k) || [0, 0]; o[0]++; o[1] += snap.nodes[i + iS]; m.set(k, o);
	}
	return m;
}
const [a, b, top = 30] = process.argv.slice(2);
const A = load(a), B = load(b);
const rows = [];
for (const [k, v] of B) { const w = A.get(k) || [0, 0]; rows.push({ k, dn: v[0] - w[0], ds: v[1] - w[1], n: v[0] }); }
console.log('top growth by COUNT'); rows.sort((x, y) => y.dn - x.dn).slice(0, +top).forEach(r => console.log(String(r.dn).padStart(7), String(Math.round(r.ds / 1024)).padStart(8) + ' KB', ' total', r.n, r.k));
console.log('\ntop growth by SIZE'); rows.sort((x, y) => y.ds - x.ds).slice(0, +top).forEach(r => console.log(String(Math.round(r.ds / 1024)).padStart(8) + ' KB', String(r.dn).padStart(7), r.k));
