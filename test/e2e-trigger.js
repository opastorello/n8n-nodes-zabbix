// Live validation of the ZabbixTrigger polling node against a DISPOSABLE
// Zabbix: bootstrap poll → generate a real problem → next poll fires exactly
// once → quiet poll emits nothing.
const path = require('path');
const http = require('http');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const BASE = process.env.ZABBIX_URL || 'http://127.0.0.1:8089';
const TOKEN =
	process.env.ZABBIX_TOKEN ||
	(fs.existsSync(path.join(__dirname, 'token.txt'))
		? fs.readFileSync(path.join(__dirname, 'token.txt'), 'utf8').trim()
		: (() => {
				throw new Error('Set ZABBIX_TOKEN or create test/token.txt');
			})());

// SAFETY GUARD (destructive suite)
{
	const host = new URL(BASE).hostname;
	if (!['127.0.0.1', 'localhost', '::1'].includes(host) && process.env.E2E_ALLOW_REMOTE !== '1') {
		console.error('ABORTED: ' + BASE + ' is not local. Set E2E_ALLOW_REMOTE=1 to override.');
		process.exit(2);
	}
}

const { ZabbixTrigger } = require(path.join(ROOT, 'dist/nodes/Zabbix/ZabbixTrigger.node.js'));
const { resources } = require(path.join(ROOT, 'dist/nodes/Zabbix/actions/index.js'));

function post(o) {
	return new Promise((res, rej) => {
		const u = new URL(o.url);
		const d = JSON.stringify(o.body);
		const r = http.request(
			{ hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST', headers: { ...o.headers, 'Content-Length': Buffer.byteLength(d) } },
			(x) => { let b = ''; x.on('data', (c) => (b += c)); x.on('end', () => res(JSON.parse(b))); },
		);
		r.on('error', rej);
		r.write(d);
		r.end();
	});
}
const baseCtx = {
	getCredentials: async () => ({ url: BASE, apiToken: TOKEN }),
	getNode: () => ({ name: 'ZabbixTrigger' }),
	helpers: { httpRequest: (o) => post(o) },
};
const execCtx = (params) => ({ ...baseCtx, getMode: () => 'manual', getWorkflowStaticData: () => ({}), continueOnFail: () => false, getNodeParameter: (n, i, d) => (n in params ? params[n] : d) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const R = (r) => resources[r];
const j = (rows) => rows.map((x) => x.json);

(async () => {
	console.log('=== E2E do Zabbix Trigger (polling ao vivo) ===');
	// pré-limpeza best-effort de sobras de rodadas anteriores
	try {
		const oldHosts = j(await R('host').handlers.getAll.call(execCtx({ nameSearch: 'zzz-trg', output: 'extend', options: {}, hostids: [], groupids: [], templateids: [], selects: [] }), 0));
		if (oldHosts.length) await R('host').handlers.delete.call(execCtx({ hostids: oldHosts.map((h) => h.hostid).join(',') }), 0);
		const oldGroups = j(await R('hostgroup').handlers.getAll.call(execCtx({ nameSearch: 'zzz-trg', output: 'extend', options: {}, groupids: [], selects: [] }), 0));
		if (oldGroups.length) await R('hostgroup').handlers.delete.call(execCtx({ groupids: oldGroups.map((g) => g.groupid).join(',') }), 0);
	} catch { /* melhor esforço */ }

	// infra: grupo + host + trapper + trigger
	const hg = j(await R('hostgroup').handlers.create.call(execCtx({ name: 'zzz-trg-g', fields: {} }), 0))[0].groupids[0];
	const host = j(await R('host').handlers.create.call(execCtx({
		host: 'zzz-trg-host', groups: [hg],
		interfaces: { interfaceItems: [{ type: 1, useip: 1, ip: '127.0.0.1', port: '10050', main: 1 }] },
		additionalFields: {},
	}), 0))[0].hostids[0];
	const item = j(await R('item').handlers.create.call(execCtx({ name: 'zzz-trg-m', key_: 'zzz.trg.m', hostid: host, fields: { type: 2, value_type: 3 } }), 0))[0].itemids[0];
	await R('trigger').handlers.create.call(execCtx({ fields: { description: 'zzz-trg-fire', expression: 'last(/zzz-trg-host/zzz.trg.m)>10', priority: 4 } }), 0);
	console.log('  infra criada (host ' + host + ', item ' + item + ')');

	// trigger node com staticData PERSISTENTE entre polls (como o n8n faz)
	const staticData = {};
	const trigger = new ZabbixTrigger();
	const pollCtx = (mode) => ({
		...baseCtx,
		getMode: () => mode,
		getWorkflowStaticData: () => staticData,
		getNodeParameter: (n, d) => ({ event: 'problem', groupids: [hg], severity: 3, additionalFilters: {} })[n] ?? d,
	});

	// poll 1: bootstrap — não emite nada em modo trigger
	const p1 = await trigger.poll.call(pollCtx('trigger'));
	if (p1 !== null) throw new Error('poll 1 deveria ser null (bootstrap), veio: ' + JSON.stringify(p1));
	console.log('  ✅ poll 1 (bootstrap): null, watermark=' + staticData.lastEventId);

	// gera problema real: push > 10 (com retry p/ cache do server)
	let pushed = false;
	for (let a = 0; a < 20 && !pushed; a++) {
		try { await R('history').handlers.push.call(execCtx({ pushValues: JSON.stringify([{ itemid: Number(item), value: '99' }]) }), 0); pushed = true; }
		catch { await sleep(6000); }
	}
	if (!pushed) throw new Error('push nunca aceito');
	console.log('  valor 99 injetado — aguardando o problema...');

	// poll 2: espera o problema aparecer e o trigger emitir EXATAMENTE 1
	let fired;
	for (let a = 0; a < 20 && !fired; a++) {
		await sleep(4000);
		const out = await trigger.poll.call(pollCtx('trigger'));
		if (out) fired = out;
	}
	if (!fired) throw new Error('trigger não disparou');
	if (fired[0].length !== 1) throw new Error('esperava 1 item, veio ' + fired[0].length);
	const prob = fired[0][0].json;
	console.log('  ✅ poll N (novo problema): 1 item — "' + prob.name + '" (evento ' + prob.eventid + ', sev ' + prob.severity + ')');

	// poll 3: sem novidade → null (não repete o mesmo problema)
	const p3 = await trigger.poll.call(pollCtx('trigger'));
	if (p3 !== null) throw new Error('poll pós-disparo deveria ser null, veio: ' + JSON.stringify(p3));
	console.log('  ✅ poll seguinte: null (sem repetição — exactly-once confirmado)');

	// limpeza
	await R('host').handlers.delete.call(execCtx({ hostids: host }), 0);
	await R('hostgroup').handlers.delete.call(execCtx({ groupids: hg }), 0);
	console.log('  limpeza ok\n=== TRIGGER VALIDADO AO VIVO: 3/3 ✅ ===');
})().catch((e) => { console.error('FALHA:', e.message); process.exit(1); });
