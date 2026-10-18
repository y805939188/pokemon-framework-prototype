'use strict';
// Offline V8 heap-snapshot helper: instance counts by name and the shortest retaining path of an instance.
// Usage: node --max-old-space-size=6144 scripts/heap-analyze.cjs <file.heapsnapshot> [NameRegex] [pathTarget]
const fs = require('fs');
const [file, re = 'Scene_|Window_|Bitmap|Sprite|Texture|Graphics|Container|Filter|Battle|Session|Canvas', target] = process.argv.slice(2);
const snap = JSON.parse(fs.readFileSync(file, 'utf8'));
const { node_fields: nf, edge_fields: ef, node_types: nt, edge_types: et } = snap.snapshot.meta;
const N = nf.length, E = ef.length;
const nodes = snap.nodes, edges = snap.edges, strings = snap.strings;
const iType = nf.indexOf('type'), iName = nf.indexOf('name'), iEdgeCount = nf.indexOf('edge_count'), iSize = nf.indexOf('self_size');
const eType = ef.indexOf('type'), eName = ef.indexOf('name_or_index'), eTo = ef.indexOf('to_node');
const count = nodes.length / N;
const nType = i => nt[0][nodes[i * N + iType]];
const nName = i => strings[nodes[i * N + iName]];
const firstEdge = new Int32Array(count + 1);
let acc = 0; for (let i = 0; i < count; i++) { firstEdge[i] = acc; acc += nodes[i * N + iEdgeCount]; } firstEdge[count] = acc;
const byName = new Map();
for (let i = 0; i < count; i++) {
	const t = nType(i); if (t !== 'object' && t !== 'native' && t !== 'closure') continue;
	const n = nName(i); if (!new RegExp(re).test(n)) continue;
	const k = `${t}:${n}`; const o = byName.get(k) || { n: 0, size: 0 }; o.n++; o.size += nodes[i * N + iSize]; byName.set(k, o);
}
console.log('instances by name (matching /' + re + '/):');
for (const [k, v] of [...byName].sort((a, b) => b[1].n - a[1].n).slice(0, 40)) console.log(String(v.n).padStart(6), String(Math.round(v.size / 1024)).padStart(8) + ' KB', k);
// shortest path from the synthetic root to the first node named `target`
if (target && target !== 'none') {
	const iId = nf.indexOf('id'); let goal = -1; for (let i = 0; i < count; i++) { if ((nType(i) === 'object' || nType(i) === 'native') && nName(i) === target && (goal < 0 || nodes[i * N + iId] > nodes[goal * N + iId])) goal = i; } // newest instance
	if (goal < 0) { console.log('no object named', target); process.exit(0); }
	const parent = new Int32Array(count).fill(-2), pedge = new Int32Array(count);
	const q = [0]; parent[0] = -1; let head = 0;
	while (head < q.length && parent[goal] === -2) {
		const u = q[head++];
		for (let e = firstEdge[u]; e < firstEdge[u + 1]; e++) {
			const t = et[0][edges[e * E + eType]]; if (t === 'weak') continue;
			const v = edges[e * E + eTo] / N; if (parent[v] !== -2) continue;
			parent[v] = u; pedge[v] = e; q.push(v);
		}
	}
	const path = []; for (let v = goal; v >= 0 && parent[v] !== -1; v = parent[v]) {
		const e = pedge[v]; const t = et[0][edges[e * E + eType]];
		const nm = (t === 'element' || t === 'hidden') ? edges[e * E + eName] : strings[edges[e * E + eName]];
		path.push(`${nName(parent[v])} --${t}:${nm}--> ${nName(v)}(${nType(v)})`);
	}
	console.log('\nshortest retaining path to', target + ':'); path.reverse().forEach(p => console.log('  ', p.slice(0, 200)));
}

// ---- retention groups: for every instance of `groupName`, the shortest-path signature (first N hops from the root)
const groupName = process.argv[5];
if (groupName) {
	const parent = new Int32Array(count).fill(-2), pedge = new Int32Array(count);
	const q = [0]; parent[0] = -1; let head = 0;
	while (head < q.length) {
		const u = q[head++];
		for (let e = firstEdge[u]; e < firstEdge[u + 1]; e++) {
			const t = et[0][edges[e * E + eType]]; if (t === 'weak') continue;
			const v = edges[e * E + eTo] / N; if (parent[v] !== -2) continue;
			parent[v] = u; pedge[v] = e; q.push(v);
		}
	}
	const groups = new Map();
	for (let i = 0; i < count; i++) {
		if (nName(i) !== groupName || (nType(i) !== 'object' && nType(i) !== 'native')) continue;
		const hops = []; for (let v = i; v >= 0 && parent[v] !== -1 && parent[v] !== -2; v = parent[v]) {
			const e = pedge[v]; const t = et[0][edges[e * E + eType]];
			const nm = (t === 'element' || t === 'hidden') ? '#' : strings[edges[e * E + eName]];
			hops.push(`${nName(parent[v]).slice(0, 28)}.${String(nm).slice(0, 30)}`);
		}
		hops.reverse();
		const sig = hops.slice(2, 11).join(' > ');
		groups.set(sig, (groups.get(sig) || 0) + 1);
	}
	console.log(`\nretention groups for ${groupName}: ${[...groups.values()].reduce((a, b) => a + b, 0)} instances`);
	for (const [sig, n] of [...groups].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(String(n).padStart(6), sig.slice(0, 600));
}
