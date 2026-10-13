// Live validation of the NOC features against a DISPOSABLE Zabbix (7.0+):
// history auto type, severity by name, host by IP, Set Tags/Macros (+dry run),
// site summary, Who Gets Notified, webhook trigger end to end (Zabbix → real
// HTTP POST → node), graph image and trigger dedup.
//   ZABBIX_URL=http://127.0.0.1:8089 ZABBIX_TOKEN=… node test/e2e-noc.js
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const BASE = (process.env.ZABBIX_URL || 'http://127.0.0.1:8089').replace(/\/+$/, '');
const TOKEN = process.env.ZABBIX_TOKEN;
// Where the Zabbix server container can reach this machine (Docker Desktop).
const CALLBACK_HOST = process.env.ZABBIX_CALLBACK_HOST || 'host.docker.internal';
const CALLBACK_PORT = Number(process.env.ZABBIX_CALLBACK_PORT || 5679);
if (!TOKEN) throw new Error('Set ZABBIX_TOKEN (node test/create-token.js <url>)');
if (!['127.0.0.1', 'localhost', '::1'].includes(new URL(BASE).hostname) && process.env.E2E_ALLOW_REMOTE !== '1') {
	console.error('ABORTED: ' + BASE + ' is not local. Set E2E_ALLOW_REMOTE=1 to override.');
	process.exit(2);
}

const { resources } = require(path.join(ROOT, 'dist/nodes/Zabbix/actions/index.js'));
const { ZabbixTrigger } = require(path.join(ROOT, 'dist/nodes/Zabbix/ZabbixTrigger.node.js'));
const { ZabbixWebhookTrigger } = require(path.join(ROOT, 'dist/nodes/Zabbix/ZabbixWebhookTrigger.node.js'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function httpRequest(o) {
	const res = await fetch(o.url, { method: o.method || 'POST', headers: o.headers, body: typeof o.body === 'string' ? o.body : JSON.stringify(o.body), redirect: o.disableFollowRedirect ? 'manual' : 'follow' });
	if (o.returnFullResponse) {
		const headers = {};
		res.headers.forEach((v, k) => (headers[k] = v));
		headers['set-cookie'] = res.headers.getSetCookie?.() ?? [];
		const body = o.encoding === 'arraybuffer' ? await res.arrayBuffer() : await res.text();
		return { headers, body, statusCode: res.status };
	}
	return res.json();
}
const creds = { url: BASE, apiToken: TOKEN };
const ctx = (params, credentials = creds) => ({
	getCredentials: async () => credentials,
	getNode: () => ({ name: 'Zabbix' }),
	getTimezone: () => 'America/Sao_Paulo',
	logger: { warn: () => undefined },
	helpers: {
		httpRequest,
		prepareBinaryData: async (buffer, fileName, mimeType) => ({ data: buffer.toString('base64'), fileName, mimeType, fileSize: buffer.length }),
	},
	getNodeParameter: (n, i, d) => (n in params ? params[n] : d),
});
const run = async (resource, operation, params, credentials) =>
	(await resources[resource].handlers[operation].call(ctx(params, credentials), 0)).map((r) => r.json ?? r);
const runRaw = (resource, operation, params, credentials) => resources[resource].handlers[operation].call(ctx(params, credentials), 0);
const api = async (method, params) => (await httpRequest({ url: BASE + '/api_jsonrpc.php', headers: { 'Content-Type': 'application/json-rpc', Authorization: 'Bearer ' + TOKEN }, body: { jsonrpc: '2.0', method, params, id: 1 } })).result;
const apiOrThrow = async (method, params) => {
	const r = await httpRequest({ url: BASE + '/api_jsonrpc.php', headers: { 'Content-Type': 'application/json-rpc', Authorization: 'Bearer ' + TOKEN }, body: { jsonrpc: '2.0', method, params, id: 1 } });
	if (r.error) throw new Error(method + ': ' + r.error.message + ' ' + r.error.data);
	return r.result;
};

let passed = 0;
const ok = (label, cond, detail) => {
	if (!cond) throw new Error(label + ' — ' + String(JSON.stringify(detail) ?? 'sem dados').slice(0, 400));
	passed++;
	console.log('  ✅ ' + label);
};

async function cleanup() {
	const hosts = await api('host.get', { output: ['hostid'], search: { host: 'zzz-noc' } });
	if (hosts?.length) await api('host.delete', hosts.map((h) => h.hostid));
	const groups = await api('hostgroup.get', { output: ['groupid'], search: { name: 'zzz-noc' } });
	if (groups?.length) await api('hostgroup.delete', groups.map((g) => g.groupid));
	const actions = await api('action.get', { output: ['actionid'], search: { name: 'zzz-noc' } });
	if (actions?.length) await api('action.delete', actions.map((a) => a.actionid));
	const media = await api('mediatype.get', { output: ['mediatypeid'], search: { name: 'zzz-noc' } });
	if (media?.length) await api('mediatype.delete', media.map((m) => m.mediatypeid));
	const tpls = await api('template.get', { output: ['templateid'], search: { host: 'zzz-noc' } });
	if (tpls?.length) await api('template.delete', tpls.map((t) => t.templateid));
}

const pushValue = async (itemid, value) => {
	for (let a = 0; a < 20; a++) {
		const r = await api('history.push', [{ itemid: Number(itemid), value: String(value) }]);
		if (r && !r.data?.[0]?.error) return;
		await sleep(5000);
	}
	throw new Error('history.push never accepted');
};

(async () => {
	const version = (await httpRequest({ url: BASE + '/api_jsonrpc.php', headers: { 'Content-Type': 'application/json-rpc' }, body: { jsonrpc: '2.0', method: 'apiinfo.version', params: {}, id: 1 } })).result;
	console.log('=== NOC e2e contra Zabbix ' + version + ' ===');
	await cleanup();

	const [hg] = (await apiOrThrow('hostgroup.create', { name: 'zzz-noc-g' })).groupids;
	const [host] = (await apiOrThrow('host.create', {
		host: 'zzz-noc-h1',
		groups: [{ groupid: hg }],
		interfaces: [{ type: 1, main: 1, useip: 1, ip: '10.99.0.1', dns: '', port: '10050' }],
		tags: [{ tag: 'site', value: 'XDRJ' }],
	})).hostids;
	const [itemNum] = (await apiOrThrow('item.create', { hostid: host, name: 'num', key_: 'zzz.noc.num', type: 2, value_type: 0, trapper_hosts: '0.0.0.0/0' })).itemids;
	const [itemTxt] = (await apiOrThrow('item.create', { hostid: host, name: 'txt', key_: 'zzz.noc.txt', type: 2, value_type: 1, trapper_hosts: '0.0.0.0/0' })).itemids;
	const [triggerid] = (await apiOrThrow('trigger.create', { description: 'zzz-noc-fire', expression: 'last(/zzz-noc-h1/zzz.noc.num)>10', priority: 4, manual_close: 1 })).triggerids;

	// --- Item → Get History (value type detected; float and character mixed)
	await pushValue(itemNum, '1.5');
	await pushValue(itemTxt, 'hello');
	await sleep(3000);
	const hist = await run('item', 'getHistory', { historyItemIds: `${itemNum},${itemTxt}`, historyHours: 1, historyFrom: '', historyTo: '', trendDays: 7, historyLimit: 10 });
	ok('Item → Get History detecta o tipo (float + char na mesma chamada)', hist.some((r) => r.value === '1.5' || r.value === '1.5000') && hist.some((r) => r.value === 'hello') && hist.every((r) => r.time_local), hist);

	// --- Host by IP + dry run + Disable/Enable
	const dry = await run('host', 'disable', { targetHostids: ['10.99.0.1'], dryRun: true });
	const stillOn = (await api('host.get', { hostids: [host], output: ['status'] }))[0].status;
	ok('Host por IP + Dry Run não altera nada', dry[0]?.dry_run && dry[0].hostid === host && dry[0].after === 'disabled' && stillOn === '0', dry);
	await run('host', 'disable', { targetHostids: ['10.99.0.1'] });
	ok('Host → Disable por IP', (await api('host.get', { hostids: [host], output: ['status'] }))[0].status === '1');
	await run('host', 'enable', { targetHostids: [host] });

	// --- Set Tags: merge / dry run / remove / replace
	const tagsOf = async () => (await api('host.get', { hostids: [host], selectTags: ['tag', 'value'], output: ['hostid'] }))[0].tags.map((t) => `${t.tag}:${t.value}`).sort();
	await run('host', 'setTags', { targetHostids: [host], tagMode: 'merge', hostTags: { tagItems: [{ tag: 'env', value: 'prod' }] } });
	ok('Set Tags (Merge) mantém as existentes', JSON.stringify(await tagsOf()) === JSON.stringify(['env:prod', 'site:XDRJ']), await tagsOf());
	await run('host', 'setTags', { targetHostids: [host], tagMode: 'replace', hostTags: { tagItems: [{ tag: 'x', value: '1' }] }, dryRun: true });
	ok('Set Tags (Dry Run) não altera', JSON.stringify(await tagsOf()) === JSON.stringify(['env:prod', 'site:XDRJ']));
	await run('host', 'setTags', { targetHostids: [host], tagMode: 'remove', hostTags: { tagItems: [{ tag: 'env', value: '' }] } });
	ok('Set Tags (Remove)', JSON.stringify(await tagsOf()) === JSON.stringify(['site:XDRJ']), await tagsOf());

	// --- Set Macros: merge creates + updates, remove
	const macrosOf = async () => (await api('usermacro.get', { hostids: [host], output: ['macro', 'value'] })).map((m) => `${m.macro}=${m.value}`).sort();
	await run('host', 'setMacros', { targetHostids: [host], macroMode: 'merge', hostMacros: { macroItems: [{ macro: '{$A}', value: '1' }, { macro: '{$B}', value: '2' }] } });
	await run('host', 'setMacros', { targetHostids: [host], macroMode: 'merge', hostMacros: { macroItems: [{ macro: '{$A}', value: '9' }] } });
	ok('Set Macros (Merge) cria e atualiza sem apagar', JSON.stringify(await macrosOf()) === JSON.stringify(['{$A}=9', '{$B}=2']), await macrosOf());
	await run('host', 'setMacros', { targetHostids: [host], macroMode: 'remove', hostMacros: { macroItems: [{ macro: '{$B}', value: '' }] } });
	ok('Set Macros (Remove)', JSON.stringify(await macrosOf()) === JSON.stringify(['{$A}=9']), await macrosOf());

	// --- Who Gets Notified: one matching action with ack (update) operation, one not matching
	const admin = (await api('user.get', { filter: { username: 'Admin' }, output: ['userid'] }))[0].userid;
	await apiOrThrow('action.create', {
		name: 'zzz-noc-match', eventsource: 0, status: 0, esc_period: '1h',
		filter: { evaltype: 0, conditions: [{ conditiontype: 4, operator: 5, value: '4' }, { conditiontype: 0, operator: 0, value: hg }] },
		operations: [{ operationtype: 0, opmessage: { default_msg: 1, mediatypeid: '0' }, opmessage_usr: [{ userid: admin }] }],
		update_operations: [{ operationtype: 0, opmessage: { default_msg: 1, mediatypeid: '0' }, opmessage_usr: [{ userid: admin }] }],
	});
	await apiOrThrow('action.create', {
		name: 'zzz-noc-nomatch', eventsource: 0, status: 0, esc_period: '1h',
		filter: { evaltype: 0, conditions: [{ conditiontype: 4, operator: 0, value: '5' }] },
		operations: [{ operationtype: 0, opmessage: { default_msg: 1, mediatypeid: '0' }, opmessage_usr: [{ userid: admin }] }],
	});

	// --- Webhook: the trigger node registers its media type; Admin gets that media; an action sends to it
	const received = [];
	const server = http.createServer((req, res) => {
		let body = '';
		req.on('data', (c) => (body += c));
		req.on('end', () => {
			received.push({ headers: req.headers, body: JSON.parse(body || '{}') });
			res.writeHead(200).end('ok');
		});
	});
	await new Promise((r) => server.listen(CALLBACK_PORT, '0.0.0.0', r));
	const webhookUrl = `http://${CALLBACK_HOST}:${CALLBACK_PORT}/webhook/zabbix`;
	const hookStatic = {};
	const hookParams = { mediaTypeName: 'zzz-noc-n8n', secret: 's3cret', events: ['problem', 'recovery', 'update'], minSeverity: 0 };
	const hookCtx = {
		...ctx(hookParams),
		getNodeParameter: (n, d) => (n in hookParams ? hookParams[n] : d),
		getNodeWebhookUrl: () => webhookUrl,
		getWorkflowStaticData: () => hookStatic,
	};
	const wt = new ZabbixWebhookTrigger();
	ok('Webhook: checkExists antes de criar = false', (await wt.webhookMethods.default.checkExists.call(hookCtx)) === false);
	await wt.webhookMethods.default.create.call(hookCtx);
	ok('Webhook: ativação cria o media type no Zabbix', !!hookStatic.mediatypeid && (await wt.webhookMethods.default.checkExists.call(hookCtx)) === true, hookStatic);
	await apiOrThrow('user.update', { userid: admin, medias: [{ mediatypeid: hookStatic.mediatypeid, sendto: 'n8n', active: 0, severity: 63, period: '1-7,00:00-24:00' }] });
	await apiOrThrow('action.create', {
		name: 'zzz-noc-webhook', eventsource: 0, status: 0, esc_period: '1h',
		filter: { evaltype: 0, conditions: [{ conditiontype: 2, operator: 0, value: triggerid }] },
		operations: [{ operationtype: 0, opmessage: { default_msg: 1, mediatypeid: hookStatic.mediatypeid }, opmessage_usr: [{ userid: admin }] }],
		recovery_operations: [{ operationtype: 0, opmessage: { default_msg: 1, mediatypeid: hookStatic.mediatypeid }, opmessage_usr: [{ userid: admin }] }],
	});

	// The server only acts on actions/media it has in its configuration cache.
	const cacheWait = Number(process.env.ZABBIX_CACHE_WAIT_MS || 70000);
	console.log(`  … aguardando ${cacheWait / 1000}s o cache de configuração do server carregar as actions`);
	await sleep(cacheWait);

	// --- Fire a real problem
	const trigStatic = {};
	const trig = new ZabbixTrigger();
	const trigParams = { event: 'problem', groupids: [hg], severity: 'high', additionalFilters: '{}', dedupMinutes: 30 };
	const poll = () => trig.poll.call({ ...ctx({}), getMode: () => 'trigger', getWorkflowStaticData: () => trigStatic, getNodeParameter: (n, d) => (n in trigParams ? trigParams[n] : d) });
	await poll();
	await pushValue(itemNum, 99);
	let eventid;
	for (let a = 0; a < 30 && !eventid; a++) {
		await sleep(3000);
		eventid = (await api('problem.get', { hostids: [host], output: ['eventid'] }))[0]?.eventid;
	}
	ok('problema real gerado', !!eventid);

	const simple = await run('problem', 'getAll', { eventids: '', hostids: host, groupids: '', objectids: '', output: 'extend', options: {}, simplify: true, minSeverity: 'high' });
	ok('Severidade por nome ("high") no Problem → Get Many', simple.length === 1 && simple[0].severity_name === 'High', simple);

	const who = (await run('event', 'whoGetsNotified', { notifyEventId: eventid }))[0];
	const match = who.actions.find((a) => a.name === 'zzz-noc-match');
	ok('Who Gets Notified: action que casa = yes, com ack notificando Admin', match?.matches === 'yes' && who.acknowledge_will_notify && match.on_acknowledge[0]?.users.includes('Admin'), who);
	ok('Who Gets Notified: action de severidade Disaster = não casa', who.not_matching.includes('zzz-noc-nomatch'), who.not_matching);

	const site = (await run('host', 'getSiteSummary', { summaryGroupIds: [], summaryTag: 'site', summaryTagValue: 'XDRJ' }))[0];
	ok('Get Site Summary por tag de site', site.hosts.total === 1 && site.problems.total >= 1 && site.problems.by_severity.High >= 1, site);

	// --- Webhook delivery: Zabbix → our HTTP server → node.webhook()
	for (let a = 0; a < 40 && !received.length; a++) await sleep(2000);
	ok('Webhook: Zabbix entregou o alerta via HTTP com o X-Zabbix-Token', received.length > 0 && received[0].headers['x-zabbix-token'] === 's3cret', received[0]);
	const delivered = received[0];
	const webhookOut = await wt.webhook.call({
		...hookCtx,
		getHeaderData: () => delivered.headers,
		getBodyData: () => delivered.body,
		getResponseObject: () => ({ status: () => ({ json: () => undefined }) }),
	});
	const alert = webhookOut.workflowData[0][0].json;
	ok('Webhook Trigger normaliza o alerta (problem, eventid, severidade, host, tags)', alert.kind === 'problem' && alert.eventid === eventid && alert.severity_name === 'High' && alert.host === 'zzz-noc-h1' && Array.isArray(alert.tags), alert);
	let rejected = false;
	await wt.webhook.call({ ...hookCtx, getHeaderData: () => ({}), getBodyData: () => delivered.body, getResponseObject: () => ({ status: (code) => ({ json: () => (rejected = code === 401) }) }) });
	ok('Webhook Trigger recusa chamada sem o segredo (401)', rejected);

	// --- Trigger: first problem fires; a reopening inside the dedup window doesn't
	let first;
	for (let a = 0; a < 10 && !first; a++) {
		first = await poll();
		if (!first) await sleep(2000);
	}
	ok('Trigger dispara o primeiro problema', first?.[0]?.length === 1);
	await pushValue(itemNum, 1);
	await sleep(4000);
	await pushValue(itemNum, 98);
	let reopened;
	for (let a = 0; a < 20 && !reopened; a++) {
		await sleep(3000);
		reopened = (await api('event.get', { objectids: [triggerid], value: 1, output: ['eventid'], sortfield: 'eventid', sortorder: 'DESC' })).find((e) => e.eventid !== eventid);
	}
	ok('o problema reabriu (flapping)', !!reopened);
	const second = await poll();
	ok('Dedup: reabertura dentro da janela não dispara', second === null, second);

	// --- Graph image (frontend login with username/password)
	const graph = await runRaw('item', 'getGraphImage', { graphItemIds: itemNum, graphFrom: 'now-1h', graphTo: 'now', graphWidth: 600, graphHeight: 200, binaryPropertyName: 'data' }, { url: BASE, authentication: 'password', username: 'Admin', password: 'zabbix' });
	const png = Buffer.from(graph[0].binary.data.data, 'base64');
	ok('Item → Get Graph Image devolve PNG', graph[0].binary.data.mimeType === 'image/png' && png.subarray(1, 4).toString() === 'PNG' && png.length > 1000, { size: png.length });
	let tokenRefused = false;
	try {
		await runRaw('item', 'getGraphImage', { graphItemIds: itemNum }, creds);
	} catch (e) {
		tokenRefused = /Username & Password/.test(e.message);
	}
	ok('Get Graph Image com token explica que precisa de usuário/senha', tokenRefused);

	// --- Deactivation disables (doesn't delete) the media type
	await wt.webhookMethods.default.delete.call(hookCtx);
	const mt = (await api('mediatype.get', { filter: { name: 'zzz-noc-n8n' }, output: ['status'] }))[0];
	ok('Webhook: desativação desabilita o media type (não apaga)', mt?.status === '1', mt);

	server.close();
	await apiOrThrow('user.update', { userid: admin, medias: [] });
	await cleanup();
	console.log('=== NOC VALIDADO AO VIVO: ' + passed + ' ✅ ===');
	process.exit(0);
})().catch(async (e) => {
	console.error('FALHA:', e.message, e.description ?? '');
	try {
		await cleanup();
	} catch {
		/* best effort */
	}
	process.exit(1);
});
