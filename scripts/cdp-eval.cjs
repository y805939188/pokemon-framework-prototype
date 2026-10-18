'use strict';
// Evaluate an expression in a running NW.js page over the DevTools protocol.
// Usage: node scripts/cdp-eval.cjs <port> '<expression>'
const [port, expr] = process.argv.slice(2);
(async () => {
	const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
	const page = list.find(t => t.type === 'page') || list[0];
	const ws = new WebSocket(page.webSocketDebuggerUrl);
	await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
	ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id === 1) { console.log(JSON.stringify(m.result && m.result.result && (m.result.result.value ?? m.result.result.description), null, 1)); ws.close(); } };
	ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: true } }));
})().catch(e => { console.error(e); process.exit(1); });
