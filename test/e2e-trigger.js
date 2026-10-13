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
	getNode: () => ({ name: 'ZabbixTrigger' }), getTimezone: () => 'America/Sao_Paulo',
	helpers: { httpRequest: (o) => post(o) },
};
const execCtx = (params) => ({ ...baseCtx, getMode: () => 'manual', getWorkflowStaticData: () => ({}), continueOnFail: () => false, getNodeParameter: (n, i, d) => (n in params ? params[n] : d) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { zabbixSend: send, senderTarget } = require('./zabbix-sender');
const zabbixSend = (host, key, value) => send(senderTarget(BASE), host, key, value);
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
	const item = j(await R('item').handlers.create.call(execCtx({ name: 'zzz-trg-m', key_: 'zzz.trg.m', hostid: host, fields: { type: 2, value_type: 3, additionalParameters: '{"trapper_hosts":"0.0.0.0/0"}' } }), 0))[0].itemids[0];
	await R('trigger').handlers.create.call(execCtx({ fields: { description: 'zzz-trg-fire', expression: 'last(/zzz-trg-host/zzz.trg.m)>10', priority: 4 } }), 0);
	console.log('  infra criada (host ' + host + ', item ' + item + ')');

	// trigger node com staticData PERSISTENTE entre polls (como o n8n faz)
	const trigger = new ZabbixTrigger();
	const makePoller = (params) => {
		const staticData = {};
		const ctx = (mode) => ({
			...baseCtx,
			getMode: () => mode,
			getWorkflowStaticData: () => staticData,
			getNodeParameter: (n, d) => ({ groupids: [hg], additionalFilters: '{}', ...params })[n] ?? d,
		});
		return { staticData, poll: (mode = 'trigger') => trigger.poll.call(ctx(mode)) };
	};
	const problems = makePoller({ event: 'problem', severity: 3 });
	const resolved = makePoller({ event: 'resolved', severity: 4 });
	// filtro JSON como STRING (como o n8n entrega) por uma tag que não existe: nunca deve disparar
	const tagFiltered = makePoller({ event: 'problem', additionalFilters: '{"tags":[{"tag":"zzz-no-such-tag"}]}' });
	const staticData = problems.staticData;

	// poll 1: bootstrap — não emite nada em modo trigger
	const p1 = await problems.poll();
	await resolved.poll();
	await tagFiltered.poll();
	if (p1 !== null) throw new Error('poll 1 deveria ser null (bootstrap), veio: ' + JSON.stringify(p1));
	console.log('  ✅ poll 1 (bootstrap): null, watermark=' + staticData.lastEventId);

	// gera problema real: push > 10 (com retry p/ cache do server)
	const pushValue = async (value) => {
		for (let a = 0; a < 20; a++) {
			try {
				await R('history').handlers.push.call(execCtx({ pushValues: JSON.stringify([{ itemid: Number(item), value }]) }), 0);
				return;
			} catch (e) {
				// history.push só existe a partir do 7.0: usa o protocolo do zabbix_sender
				if (/is not available on Zabbix/.test(e.message)) {
					if ((await zabbixSend('zzz-trg-host', 'zzz.trg.m', value)) === 1) return;
				}
				await sleep(6000);
			}
		}
		throw new Error('push nunca aceito');
	};
	await pushValue('99');
	console.log('  valor 99 injetado — aguardando o problema...');

	// poll 2: espera o problema aparecer e o trigger emitir EXATAMENTE 1
	let fired;
	for (let a = 0; a < 20 && !fired; a++) {
		await sleep(4000);
		const out = await problems.poll();
		if (out) fired = out;
	}
	if (!fired) throw new Error('trigger não disparou');
	if (fired[0].length !== 1) throw new Error('esperava 1 item, veio ' + fired[0].length);
	const prob = fired[0][0].json;
	if (prob.severity_name !== 'High') throw new Error('severity_name esperado High, veio ' + prob.severity_name);
	if (prob.hosts?.[0]?.host !== 'zzz-trg-host') throw new Error('hosts não veio no evento: ' + JSON.stringify(prob.hosts));
	if (!String(prob.event_url).includes('eventid=' + prob.eventid)) throw new Error('event_url inválida: ' + prob.event_url);
	console.log('  ✅ poll N (novo problema): 1 item — "' + prob.name + '" (evento ' + prob.eventid + ', ' + prob.severity_name + ', host ' + prob.hosts[0].name + ')');

	// poll 3: sem novidade → null (não repete o mesmo problema)
	const p3 = await problems.poll();
	if (p3 !== null) throw new Error('poll pós-disparo deveria ser null, veio: ' + JSON.stringify(p3));
	console.log('  ✅ poll seguinte: null (sem repetição — exactly-once confirmado)');

	const tagOut = await tagFiltered.poll();
	if (tagOut !== null) throw new Error('filtro JSON (string) foi ignorado: disparou ' + JSON.stringify(tagOut));
	console.log('  ✅ Additional Filters em string aplicado (tag inexistente não disparou)');

	// teste manual: mostra o último evento sem mover a marca
	const before = staticData.lastEventId;
	const manual = await problems.poll('manual');
	if (!manual || manual[0][0].json.eventid !== prob.eventid) throw new Error('modo manual deveria trazer o último problema');
	if (staticData.lastEventId !== before) throw new Error('modo manual moveu a watermark');
	console.log('  ✅ modo manual: devolve o último problema sem mover a watermark');

	// operações compostas contra o problema real ainda aberto
	const ctxOut = j(await R('problem').handlers.getContext.call(execCtx({ contextEventId: prob.eventid }), 0))[0];
	if (!ctxOut.found || ctxOut.host?.host !== 'zzz-trg-host' || !ctxOut.trigger?.expression?.includes('zzz-trg-host'))
		throw new Error('Get Context incompleto: ' + JSON.stringify(ctxOut).slice(0, 300));
	if (!ctxOut.recurrence || !Array.isArray(ctxOut.trigger.items) || !ctxOut.trigger.items.length)
		throw new Error('Get Context sem recorrência/itens: ' + JSON.stringify(ctxOut).slice(0, 300));
	console.log('  ✅ Problem → Get Context: "' + ctxOut.summary + '" (recorrência ' + ctxOut.recurrence.verdict + ', item lastvalue ' + ctxOut.trigger.items[0].lastvalue + ')');
	const health = j(await R('host').handlers.getHealth.call(execCtx({ targetHostids: [host], staleMinutes: 60 }), 0))[0];
	if (!health.found || health.problems.total < 1 || health.items.monitored < 1)
		throw new Error('Health Snapshot incompleto: ' + JSON.stringify(health).slice(0, 300));
	console.log('  ✅ Host → Get Health Snapshot: ' + health.problems.total + ' problema(s) ' + JSON.stringify(health.problems.by_severity) + ', disponibilidade ' + health.availability);
	const simple = j(await R('problem').handlers.getAll.call(execCtx({ eventids: '', hostids: host, groupids: '', objectids: '', output: 'extend', options: {}, simplify: true, minSeverity: 4 }), 0));
	if (simple.length !== 1 || simple[0].host !== 'zzz-trg-host' || simple[0].severity_name !== 'High' || !simple[0].url)
		throw new Error('Problem Get Many (Simplify) inesperado: ' + JSON.stringify(simple).slice(0, 300));
	console.log('  ✅ Problem → Get Many (Simplify, severidade ≥ High): host + link + ' + simple[0].since_local);

	// resolve o problema: push < 10 → Problem Resolved dispara com o problema original
	await sleep(1500);
	await pushValue('1');
	let rec;
	for (let a = 0; a < 20 && !rec; a++) {
		await sleep(4000);
		const out = await resolved.poll();
		if (out) rec = out;
	}
	if (!rec) throw new Error('Problem Resolved não disparou');
	if (rec[0].length !== 1) throw new Error('esperava 1 recuperação, veio ' + rec[0].length);
	const r = rec[0][0].json;
	if (r.problem?.eventid !== prob.eventid) throw new Error('problema original não vinculado: ' + JSON.stringify(r.problem));
	if (!(r.duration_seconds >= 0)) throw new Error('duration_seconds inválido: ' + r.duration_seconds);
	if (r.severity_name !== 'High') throw new Error('severity_name da recuperação deveria ser High, veio ' + r.severity_name);
	console.log('  ✅ Problem Resolved: evento ' + r.eventid + ' → problema ' + r.problem.eventid + ' (' + r.duration_seconds + 's, ' + r.severity_name + ')');
	if ((await problems.poll()) !== null) throw new Error('New Problem não deveria disparar na recuperação');
	console.log('  ✅ New Problem ignora o evento de recuperação');

	// limpeza
	await R('host').handlers.delete.call(execCtx({ hostids: host }), 0);
	await R('hostgroup').handlers.delete.call(execCtx({ groupids: hg }), 0);
	console.log('  limpeza ok\n=== TRIGGER VALIDADO AO VIVO: 11/11 ✅ ===');
})().catch((e) => { console.error('FALHA:', e.message); process.exit(1); });
