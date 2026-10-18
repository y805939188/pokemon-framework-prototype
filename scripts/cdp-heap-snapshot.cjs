'use strict';
// Take a V8 heap snapshot of a running NW.js page over the DevTools protocol (Node >= 22: global WebSocket).
// Usage: node scripts/cdp-heap-snapshot.cjs <port> <out.heapsnapshot>
const fs = require('fs');
const [port, out] = process.argv.slice(2);
(async () => {
	const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
	const page = list.find(t => t.type === 'page' && /index\.html|chrome-extension/.test(t.url)) || list[0];
	const ws = new WebSocket(page.webSocketDebuggerUrl);
	await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
	const fd = fs.openSync(out, 'w');
	let id = 0; const waiting = new Map();
	ws.onmessage = ev => {
		const m = JSON.parse(ev.data);
		if (m.method === 'HeapProfiler.addHeapSnapshotChunk') fs.writeSync(fd, m.params.chunk);
		else if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
	};
	const send = (method, params = {}) => new Promise(res => { const i = ++id; waiting.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
	await send('HeapProfiler.enable');
	await send('HeapProfiler.collectGarbage');
	await send('HeapProfiler.collectGarbage');
	await send('HeapProfiler.takeHeapSnapshot', { reportProgress: false, captureNumericValue: false });
	fs.closeSync(fd); ws.close();
	console.log('snapshot written', out, fs.statSync(out).size);
})().catch(e => { console.error(e); process.exit(1); });
