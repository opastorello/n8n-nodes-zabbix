// E2E write-suite (run against a DISPOSABLE Zabbix — creates and deletes objects!):
// 1. docker compose -f test/docker-compose.zabbix.yml up -d
// 2. create an API token (Admin/zabbix) and export ZABBIX_TOKEN
// 3. npm run build && npm run test:e2e
// Exercises the node's COMPILED handlers against a disposable
// Zabbix 7.4 in Docker. Full lifecycle: create → get(filtered) → update →
// mass → special ops → delete. Fails loudly on any error.
const path = require('path');
const http = require('http');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const BASE = process.env.ZABBIX_URL || 'http://127.0.0.1:8089';
const TOKEN = process.env.ZABBIX_TOKEN || (fs.existsSync(path.join(__dirname, 'token.txt')) ? fs.readFileSync(path.join(__dirname, 'token.txt'), 'utf8').trim() : (() => { throw new Error('Set ZABBIX_TOKEN (and optionally ZABBIX_URL) or create test/token.txt'); })());

// SAFETY GUARD: this suite CREATES AND DELETES objects and changes global
// settings. Refuse to run against anything that is not a local disposable
// instance unless the operator explicitly opts in.
{
	const host = new URL(BASE).hostname;
	const isLocal = ['127.0.0.1', 'localhost', '::1'].includes(host);
	if (!isLocal && process.env.E2E_ALLOW_REMOTE !== '1') {
		console.error('ABORTED: ' + BASE + ' is not a local instance. This suite is DESTRUCTIVE.');
		console.error('If you are absolutely sure, set E2E_ALLOW_REMOTE=1.');
		process.exit(2);
	}
}

const R = (p) => require(path.join(ROOT, 'dist/nodes/Zabbix/actions', p, 'index.js'));
const { loadOptionsMethods } = require(path.join(ROOT, 'dist/nodes/Zabbix/methods/loadOptions.js'));

function post(o) {
	return new Promise((res, rej) => {
		const u = new URL(o.url);
		const d = JSON.stringify(o.body);
		const r = http.request(
			{ hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST', headers: { ...o.headers, 'Content-Length': Buffer.byteLength(d) } },
			(x) => { let b = ''; x.on('data', (c) => (b += c)); x.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(new Error('bad json: ' + b.slice(0, 200))); } }); },
		);
		r.on('error', rej);
		r.write(d);
		r.end();
	});
}

function ctx(params) {
	return {
		getCredentials: async () => ({ url: BASE, apiToken: TOKEN }),
		getNode: () => ({ name: 'Zabbix' }),
		getMode: () => 'manual',
		getWorkflowStaticData: () => ({}),
		continueOnFail: () => false,
		helpers: { httpRequest: (o) => post(o) },
		getNodeParameter: (n, i, d) => (n in params ? params[n] : d),
	};
}

let pass = 0, fail = 0;
const failures = [];
async function step(name, fn) {
	try {
		const out = await fn();
		pass++;
		console.log(`  ✅ ${name}${out !== undefined ? ' → ' + JSON.stringify(out).slice(0, 100) : ''}`);
		return out;
	} catch (e) {
		fail++;
		failures.push(`${name}: ${e.message}`);
		console.log(`  ❌ ${name}: ${e.message}`);
		return undefined;
	}
}
const j = (rows) => rows.map((r) => r.json);

(async () => {
	console.log('=== E2E contra Zabbix de teste (7.4.11 em Docker) ===');

	// ---- HOST GROUP: create → getAll(nameSearch) → update ----
	const hg = await step('hostgroup.create', async () => {
		const out = j(await R('hostgroup').handlers.create.call(ctx({ name: 'zzz-e2e-group', fields: {} }), 0));
		return out[0].groupids[0];
	});
	await step('hostgroup.getAll (Name Contains "zzz-e2e")', async () => {
		const out = j(await R('hostgroup').handlers.getAll.call(ctx({ nameSearch: 'zzz-e2e', output: 'extend', options: {}, groupids: [], selects: [] }), 0));
		if (!out.some((g) => g.groupid === hg)) throw new Error('grupo criado não veio no filtro');
		return out.length + ' grupo(s)';
	});
	await step('hostgroup.update (rename)', async () =>
		j(await R('hostgroup').handlers.update.call(ctx({ groupid: hg, fields: { name: 'zzz-e2e-group-renamed' } }), 0))[0]);

	// ---- loadOptions dropdown contra instância real ----
	await step('loadOptions.getHostGroups (dropdown dinâmico)', async () => {
		const opts = await loadOptionsMethods.getHostGroups.call(ctx({}));
		if (!opts.some((o) => o.value === hg)) throw new Error('grupo não apareceu no dropdown');
		return opts.length + ' opções';
	});

	// ---- HOST: create (interfaces fixedCollection + tags + macros) ----
	const host = await step('host.create (Agent iface + tags + macros)', async () => {
		const out = j(await R('host').handlers.create.call(ctx({
			host: 'zzz-e2e-host', groups: [hg],
			interfaces: { interfaceItems: [{ type: 1, useip: 1, ip: '127.0.0.1', port: '10050', main: 1 }] },
			additionalFields: {
				name: 'ZZZ E2E Host', description: 'created by n8n node e2e',
				tags: { tagItems: [{ tag: 'env', value: 'e2e' }] },
				macros: { macroItems: [{ macro: '{$E2E}', value: '42' }] },
			},
		}), 0));
		return out[0].hostids[0];
	});
	await step('host.getAll (filtro por grupo + selects)', async () => {
		const out = j(await R('host').handlers.getAll.call(ctx({
			nameSearch: '', output: 'extend', options: {}, hostids: [], templateids: [],
			groupids: [hg], selects: ['selectTags', 'selectMacros', 'selectInterfaces'],
		}), 0));
		const h = out.find((x) => x.hostid === host);
		if (!h) throw new Error('host não encontrado pelo grupo');
		if (!h.tags?.some((t) => t.tag === 'env')) throw new Error('tag não persistiu');
		if (!h.macros?.some((m) => m.macro === '{$E2E}')) throw new Error('macro não persistiu');
		if (!h.interfaces?.length) throw new Error('interface não persistiu');
		return `tags=${h.tags.length} macros=${h.macros.length} ifaces=${h.interfaces.length}`;
	});
	await step('host.getAll (Name Contains busca nome técnico)', async () => {
		const out = j(await R('host').handlers.getAll.call(ctx({ nameSearch: 'zzz-e2e', output: 'extend', options: {}, hostids: [], groupids: [], templateids: [], selects: [] }), 0));
		if (!out.some((x) => x.hostid === host)) throw new Error('não achou por nome');
		return 'ok';
	});
	await step('host.update (status → unmonitored)', async () =>
		j(await R('host').handlers.update.call(ctx({ hostid: host, additionalFields: { status: 1 } }), 0))[0]);
	await step('host.update (status → monitored de volta)', async () =>
		j(await R('host').handlers.update.call(ctx({ hostid: host, additionalFields: { status: 0 } }), 0))[0]);

	// ---- ITEM (trapper p/ poder dar push) + tags fixedCollection ----
	const item = await step('item.create (trapper + tags)', async () => {
		const out = j(await R('item').handlers.create.call(ctx({
			name: 'zzz-e2e-metric', key_: 'e2e.metric', hostid: host,
			fields: { type: 2, value_type: 3, tags: { tagItems: [{ tag: 'component', value: 'e2e' }] } },
		}), 0));
		return out[0].itemids[0];
	});
	await step('history.push (injeta valor; espera cache do server)', async () => {
		let lastErr;
		for (let attempt = 0; attempt < 15; attempt++) {
			try {
				return j(await R('history').handlers.push.call(ctx({ pushValues: JSON.stringify([{ itemid: Number(item), value: '123' }]) }), 0))[0];
			} catch (e) { lastErr = e; await new Promise((r) => setTimeout(r, 6000)); }
		}
		throw lastErr;
	});
	await step('history.get (lê o valor de volta)', async () => {
		await new Promise((r) => setTimeout(r, 8000)); // dá tempo do server processar
		const out = j(await R('history').handlers.getAll.call(ctx({ history: 3, itemids: item, time_from: 0, time_till: 0, output: 'extend', options: {} }), 0));
		if (!out.length) throw new Error('sem valores (server pode demorar; não-fatal)');
		return out[0].value;
	});

	// ---- TRIGGER ----
	const trg = await step('trigger.create (expressão sobre o item)', async () => {
		const out = j(await R('trigger').handlers.create.call(ctx({
			fields: { description: 'zzz-e2e-trigger', expression: 'last(/zzz-e2e-host/e2e.metric)>100', priority: 4 },
		}), 0));
		return out[0].triggerids[0];
	});

	// ---- TEMPLATE GROUP + TEMPLATE (relation keys) ----
	const tg = await step('templategroup.create', async () =>
		j(await R('templategroup').handlers.create.call(ctx({ name: 'zzz-e2e-tgroup', fields: {} }), 0))[0].groupids[0]);
	const tpl = await step('template.create (groups relation + macros fc)', async () =>
		j(await R('template').handlers.create.call(ctx({
			host: 'zzz-e2e-template', groups: tg,
			fields: { macros: { macroItems: [{ macro: '{$TPL}', value: '1' }] } },
		}), 0))[0].templateids[0]);

	// ---- MASS ADD: template no host ----
	await step('host.massAdd (linka template ao host)', async () =>
		j(await R('host').handlers.massAdd.call(ctx({
			massHostids: host,
			massPayload: JSON.stringify({ templates: [{ templateid: tpl }] }),
		}), 0))[0]);

	// ---- GLOBAL MACRO ----
	const gm = await step('usermacro.createglobal', async () =>
		j(await R('usermacro').handlers.create.call(ctx({ macro: '{$E2EGLOBAL}', value: 'x', macroDescription: 'e2e' }), 0))[0].globalmacroids[0]);
	await step('usermacro.update (valor)', async () =>
		j(await R('usermacro').handlers.update.call(ctx({ globalmacroid: gm, macro: '', value: 'y', macroDescription: '' }), 0))[0]);

	// ---- MAINTENANCE (dateTime + períodos + dropdown groups) ----
	const mnt = await step('maintenance.create (dateTime→epoch + período)', async () =>
		j(await R('maintenance').handlers.create.call(ctx({
			name: 'zzz-e2e-maint',
			active_since: '2026-08-01T22:00:00.000Z', active_till: '2026-08-02T02:00:00.000Z',
			timeperiods: { periodItems: [{ timeperiod_type: 0, start_date: '2026-08-01T22:00:00.000Z', period: 3600 }] },
			fields: { groups: [hg] },
		}), 0))[0].maintenanceids[0]);

	// ---- SCRIPT (create + getScriptsByHosts) ----
	const scr = await step('script.create', async () =>
		j(await R('script').handlers.create.call(ctx({
			name: 'zzz-e2e-script', command: 'echo e2e',
			fields: { type: 5, scope: 2, groupid: '0' },
		}), 0))[0].scriptids[0]);
	await step('script.getScriptsByHosts', async () =>
		(j(await R('script').handlers.getScriptsByHosts.call(ctx({ byHostids: host }), 0))).length + ' script(s)');

	// ---- CONFIGURATION EXPORT ----
	await step('configuration.export (host como JSON)', async () => {
		const out = j(await R('configuration').handlers.export.call(ctx({
			format: 'json', exportOptions: JSON.stringify({ hosts: [host] }),
		}), 0));
		const raw = out[0].result ?? JSON.stringify(out[0]);
		if (!String(raw).includes('zzz-e2e-host')) throw new Error('export não contém o host');
		return 'export ok (' + String(raw).length + ' chars)';
	});

	// ---- COUNT OUTPUT + problem.get (leituras) ----
	await step('host.getAll countOutput', async () =>
		j(await R('host').handlers.getAll.call(ctx({ nameSearch: '', output: 'count', options: {}, hostids: [], groupids: [], templateids: [], selects: [] }), 0))[0]);
	await step('problem.getAll (vazio, sem erro)', async () =>
		(j(await R('problem').handlers.getAll.call(ctx({ eventids: '', groupids: [], hostids: [], objectids: '', selects: [], output: 'extend', options: {} }), 0))).length + ' problema(s)');

	// ---- DELETES (ordem reversa de dependência) ----
	await step('trigger.delete', async () => j(await R('trigger').handlers.delete.call(ctx({ triggerids: trg }), 0))[0]);
	await step('item.delete', async () => j(await R('item').handlers.delete.call(ctx({ itemids: item }), 0))[0]);
	await step('maintenance.delete', async () => j(await R('maintenance').handlers.delete.call(ctx({ maintenanceids: mnt }), 0))[0]);
	await step('script.delete', async () => j(await R('script').handlers.delete.call(ctx({ scriptids: scr }), 0))[0]);
	await step('host.delete', async () => j(await R('host').handlers.delete.call(ctx({ hostids: host }), 0))[0]);
	await step('template.delete', async () => j(await R('template').handlers.delete.call(ctx({ templateids: tpl }), 0))[0]);
	await step('templategroup.delete', async () => j(await R('templategroup').handlers.delete.call(ctx({ groupids: tg }), 0))[0]);
	await step('hostgroup.delete', async () => j(await R('hostgroup').handlers.delete.call(ctx({ groupids: hg }), 0))[0]);
	await step('usermacro.deleteglobal', async () => j(await R('usermacro').handlers.delete.call(ctx({ globalmacroids: gm }), 0))[0]);

	// ---- verificação final: nada sobrou ----
	await step('verificação: hosts zzz-e2e restantes = 0', async () => {
		const out = j(await R('host').handlers.getAll.call(ctx({ nameSearch: 'zzz-e2e', output: 'extend', options: {}, hostids: [], groupids: [], templateids: [], selects: [] }), 0));
		if (out.length) throw new Error(out.length + ' sobraram!');
		return 0;
	});

	console.log(`\n=== RESULTADO: ${pass} ✅ | ${fail} ❌ ===`);
	if (failures.length) { console.log('FALHAS:'); failures.forEach((f) => console.log('  ✗ ' + f)); process.exit(1); }
})().catch((e) => { console.error('ERRO FATAL:', e); process.exit(1); });
