// FULL E2E: exercises EVERY resource/operation of the node against a
// DISPOSABLE Zabbix 7.4 (never point at production — it creates/deletes
// objects and changes global settings).
//
//   docker compose -f test/docker-compose.zabbix.yml up -d
//   ZABBIX_TOKEN=<token> node test/e2e-full.js
//
// Ends with a coverage report: every (resource, operation) pair is exercised,
// or explicitly skipped with a reason (environment limits of a bare instance).
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

const { resources } = require(path.join(ROOT, 'dist/nodes/Zabbix/actions/index.js'));
const R = (r) => resources[r];

function post(o) {
	return new Promise((res, rej) => {
		const u = new URL(o.url);
		const d = JSON.stringify(o.body);
		const r = http.request(
			{ hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST', headers: { ...o.headers, 'Content-Length': Buffer.byteLength(d) } },
			(x) => { let b = ''; x.on('data', (c) => (b += c)); x.on('end', () => { try { res(JSON.parse(b)); } catch { rej(new Error('bad json: ' + b.slice(0, 150))); } }); },
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
const j = (rows) => rows.map((r) => r.json);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// coverage ledger
const exercised = new Set(); // "resource.op"
const skipped = new Map(); // "resource.op" -> reason
let pass = 0, fail = 0;
const failures = [];

async function op(resource, operation, params, label, check) {
	const key = `${resource}.${operation}`;
	const name = label || key;
	try {
		const out = j(await R(resource).handlers[operation].call(ctx(params), 0));
		if (check) await check(out);
		exercised.add(key);
		pass++;
		console.log(`  ✅ ${name}${out[0] !== undefined ? ' → ' + JSON.stringify(out[0]).slice(0, 90) : ''}`);
		return out;
	} catch (e) {
		fail++;
		failures.push(`${name}: ${e.message} ${e.description ?? ''}`);
		console.log(`  ❌ ${name}: ${e.message} ${e.description ? '| ' + String(e.description).slice(0, 160) : ''}`);
		return undefined;
	}
}
function skip(resource, operation, reason) {
	skipped.set(`${resource}.${operation}`, reason);
}
// Same as op(), but where the CORRECT behavior on a bare instance is a clean
// Zabbix error — passing means the node surfaced it properly.
async function opExpectError(resource, operation, params, label, errPattern) {
	const key = `${resource}.${operation}`;
	try {
		await R(resource).handlers[operation].call(ctx(params), 0);
		exercised.add(key); pass++;
		console.log(`  ✅ ${label} (aceitou — ok)`);
	} catch (e) {
		const text = `${e.message} ${e.description ?? ''}`;
		if (errPattern.test(text)) {
			exercised.add(key); pass++;
			console.log(`  ✅ ${label} (erro esperado surfaced: ${e.message})`);
		} else {
			fail++; failures.push(`${label}: erro inesperado: ${text}`);
			console.log(`  ❌ ${label}: erro inesperado: ${text.slice(0, 160)}`);
		}
	}
}
const PNG1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const getCommon = { nameSearch: '', output: 'extend', options: { limit: 5 }, selects: [] };
const ids = (out, k) => (out && out[0] && out[0][k] ? out[0][k] : [undefined]);

(async () => {
	console.log(`=== FULL E2E contra ${BASE} ===\n--- infra base ---`);
	await op('apiinfo', 'version', {}, 'apiinfo.version');

	const hg = ids(await op('hostgroup', 'create', { name: 'zzz-full-g1', fields: {} }), 'groupids')[0];
	const hg2 = ids(await op('hostgroup', 'create', { name: 'zzz-full-g1/sub', fields: {} }, 'hostgroup.create (subgrupo p/ propagate)'), 'groupids')[0];
	const host = ids(await op('host', 'create', {
		host: 'zzz-full-host', groups: [hg],
		interfaces: { interfaceItems: [{ type: 1, useip: 1, ip: '127.0.0.1', port: '10050', main: 1 }] },
		additionalFields: {},
	}), 'hostids')[0];

	console.log('\n--- host group: mass + propagate ---');
	await op('hostgroup', 'getAll', { ...getCommon, groupids: [], nameSearch: 'zzz-full' });
	await op('hostgroup', 'update', { groupid: hg2, fields: { name: 'zzz-full-g1/sub2' } });
	await op('hostgroup', 'massAdd', { massAddPayload: JSON.stringify({ groups: [{ groupid: hg2 }], hosts: [{ hostid: host }] }) });
	await op('hostgroup', 'massRemove', { massRemovePayload: JSON.stringify({ groupids: [hg2], hostids: [host] }) });
	await op('hostgroup', 'massUpdate', { massUpdatePayload: JSON.stringify({ groups: [{ groupid: hg }], hosts: [{ hostid: host }] }) });
	await op('hostgroup', 'propagate', { propagatePayload: JSON.stringify({ groups: [{ groupid: hg }], permissions: true, tag_filters: true }) });

	console.log('\n--- itens/valores/tarefa ---');
	const trapper = ids(await op('item', 'create', { name: 'zzz-full-trap', key_: 'zzz.full.trap', hostid: host, fields: { type: 2, value_type: 3 } }), 'itemids')[0];
	const internal = ids(await op('item', 'create', { name: 'zzz-full-uptime', key_: 'zabbix[uptime]', hostid: host, fields: { type: 5, value_type: 3, delay: '1m' } }, 'item.create (internal p/ task check-now)'), 'itemids')[0];
	await op('item', 'getAll', { ...getCommon, itemids: '', hostids: [host], groupids: [], templateids: [] });
	await op('item', 'update', { itemid: trapper, name: '', key_: '', hostid: '', fields: { history: '30d' } });
	// push com retry (cache do server)
	{
		let ok = false, lastErr;
		for (let a = 0; a < 15 && !ok; a++) {
			try { await R('history').handlers.push.call(ctx({ pushValues: JSON.stringify([{ itemid: Number(trapper), value: '250' }]) }), 0); ok = true; }
			catch (e) { lastErr = e; await sleep(6000); }
		}
		if (ok) { exercised.add('history.push'); pass++; console.log('  ✅ history.push (250)'); }
		else { fail++; failures.push('history.push: ' + lastErr.message); console.log('  ❌ history.push: ' + lastErr.message); }
	}
	await sleep(5000);
	await op('history', 'getAll', { history: 3, itemids: trapper, time_from: 0, time_till: 0, output: 'extend', options: {} }, 'history.getAll', (out) => { if (!out.length) throw new Error('sem valores'); });
	await op('trend', 'getAll', { itemids: trapper, output: 'extend', options: {} }, 'trend.getAll (vazio ok)');
	await op('task', 'create', { request: JSON.stringify({ type: 6, request: { itemid: internal } }) }, 'task.create (check now)');
	await op('task', 'getAll', { taskids: '', output: 'extend', options: {} });

	console.log('\n--- trigger + evento real + acknowledge ---');
	const trg = ids(await op('trigger', 'create', { fields: { description: 'zzz-full-trg', expression: 'last(/zzz-full-host/zzz.full.trap)>100', priority: 4 } }), 'triggerids')[0];
	await op('trigger', 'getAll', { ...getCommon, triggerids: '', hostids: [host], groupids: [], templateids: [] });
	await op('trigger', 'update', { triggerid: trg, fields: { priority: 5 } });
	// dispara: push > 100 de novo e espera o evento
	let eventid;
	for (let a = 0; a < 20 && !eventid; a++) {
		try { await R('history').handlers.push.call(ctx({ pushValues: JSON.stringify([{ itemid: Number(trapper), value: String(300 + a) }]) }), 0); } catch {}
		await sleep(4000);
		try {
			const probs = j(await R('problem').handlers.getAll.call(ctx({ eventids: '', groupids: [], hostids: [host], objectids: '', selects: [], output: 'extend', options: {} }), 0));
			if (probs.length) eventid = probs[0].eventid;
		} catch {}
	}
	if (eventid) { exercised.add('problem.getAll'); pass++; console.log('  ✅ problem.getAll (problema real gerado, evento ' + eventid + ')'); }
	else { fail++; failures.push('problema não gerado a tempo'); console.log('  ❌ problema não gerado a tempo'); }
	if (eventid) {
		await op('event', 'getAll', { eventids: eventid, groupids: [], hostids: [], objectids: '', selects: [], output: 'extend', options: {} });
		await op('event', 'acknowledge', { ackEventids: eventid, action: [2, 4], message: 'ack pelo e2e-full' }, 'event.acknowledge (ack+mensagem)');
		await op('alert', 'getAll', { alertids: '', actionids: '', eventids: eventid, hostids: [], userids: [], output: 'extend', options: {} }, 'alert.getAll');
	}

	console.log('\n--- LLD + prototypes ---');
	const lld = ids(await op('discoveryrule', 'create', { fields: { name: 'zzz-full-lld', key_: 'zzz.full.lld', hostid: host, type: 2 } }), 'itemids')[0];
	await op('discoveryrule', 'getAll', { ...getCommon, itemids: '', hostids: [host], templateids: [] });
	await op('discoveryrule', 'update', { itemid: lld, fields: { lifetime: '7d' } });
	const iproto = ids(await op('itemprototype', 'create', { fields: { name: 'zzz p {#N}', key_: 'zzz.proto[{#N}]', hostid: host, ruleid: lld, type: 2, value_type: 3 } }), 'itemids')[0];
	await op('itemprototype', 'getAll', { ...getCommon, itemids: '', discoveryids: lld, hostids: [] });
	await op('itemprototype', 'update', { itemid: iproto, fields: { history: '7d' } });
	const tproto = ids(await op('triggerprototype', 'create', { fields: { description: 'zzz tp {#N}', expression: 'last(/zzz-full-host/zzz.proto[{#N}])>1' } }), 'triggerids')[0];
	await op('triggerprototype', 'getAll', { ...getCommon, triggerids: '', discoveryids: lld, hostids: [] });
	await op('triggerprototype', 'update', { triggerid: tproto, fields: { priority: 2 } });
	const gproto = ids(await op('graphprototype', 'create', { fields: { name: 'zzz gp {#N}', width: 900, height: 200, gitems: JSON.stringify([{ itemid: iproto, color: 'FF0000' }]) } }), 'graphids')[0];
	await op('graphprototype', 'getAll', { ...getCommon, graphids: '', discoveryids: lld, hostids: [] });
	await op('graphprototype', 'update', { graphid: gproto, fields: { height: 220 } });
	const hproto = ids(await op('hostprototype', 'create', { fields: { host: 'zzz-{#N}', ruleid: lld, groupLinks: JSON.stringify([{ groupid: hg }]) } }), 'hostids')[0];
	await op('hostprototype', 'getAll', { ...getCommon, hostids: '', discoveryids: lld });
	await op('hostprototype', 'update', { hostid: hproto, fields: {} });
	const dlp = await op('discoveryruleprototype', 'create', { fields: { name: 'zzz dlp {#A}', key_: 'zzz.dlp[{#A}]', hostid: host, ruleid: lld, type: 2 } }, 'discoveryruleprototype.create');
	await op('discoveryruleprototype', 'getAll', { ...getCommon, itemids: '', discoveryids: lld, hostids: [] });
	if (dlp) {
		const dlpId = ids(dlp, 'itemids')[0];
		await op('discoveryruleprototype', 'update', { itemid: dlpId, fields: {} });
		await op('discoveryruleprototype', 'delete', { itemids: dlpId });
	} else { skip('discoveryruleprototype', 'update', 'create falhou (ver failures)'); skip('discoveryruleprototype', 'delete', 'create falhou'); }

	console.log('\n--- graph / dashboards / maps / imagens ---');
	const graph = ids(await op('graph', 'create', { fields: { name: 'zzz-full-graph', width: 900, height: 200, gitems: JSON.stringify([{ itemid: trapper, color: '00AA00' }]) } }), 'graphids')[0];
	await op('graph', 'getAll', { ...getCommon, graphids: '', hostids: [host], templateids: [] });
	await op('graph', 'update', { graphid: graph, fields: { height: 250 } });
	await op('graphitem', 'getAll', { graphids: graph, itemids: '', output: 'extend', options: {} });
	const dash = ids(await op('dashboard', 'create', { fields: { name: 'zzz-full-dash', pages: JSON.stringify([{}]) } }), 'dashboardids')[0];
	await op('dashboard', 'getAll', { ...getCommon, dashboardids: '' });
	await op('dashboard', 'update', { dashboardid: dash, fields: { display_period: 60 } });
	const map = ids(await op('map', 'create', { fields: { name: 'zzz-full-map', width: 600, height: 400 } }), 'sysmapids')[0];
	await op('map', 'getAll', { ...getCommon, sysmapids: '' });
	await op('map', 'update', { sysmapid: map, fields: { label_type: 0 } });
	const img = ids(await op('image', 'create', { fields: { name: 'zzz-full-img', imagetype: 1, image: PNG1x1 } }), 'imageids')[0];
	await op('image', 'getAll', { ...getCommon, imageids: '' });
	await op('image', 'update', { imageid: img, fields: { name: 'zzz-full-img2' } });
	const imap = ids(await op('iconmap', 'create', { fields: { name: 'zzz-full-imap', default_iconid: img, mappings: JSON.stringify([{ iconid: img, inventory_link: 1, expression: 'zzz' }]) } }), 'iconmapids')[0];
	await op('iconmap', 'getAll', { ...getCommon, iconmapids: '' });
	await op('iconmap', 'update', { iconmapid: imap, fields: {} });

	console.log('\n--- web scenario / valuemap / interface extra ---');
	const web = ids(await op('httptest', 'create', { name: 'zzz-full-web', hostid: host, fields: { steps: JSON.stringify([{ name: 's1', url: 'http://127.0.0.1', no: 1 }]) } }), 'httptestids')[0];
	await op('httptest', 'getAll', { ...getCommon, httptestids: '', hostids: [host], groupids: [] });
	await op('httptest', 'update', { httptestid: web, name: '', hostid: '', fields: { delay: '2m' } });
	const vmap = ids(await op('valuemap', 'create', { hostid: host, name: 'zzz-full-vmap', mappings: JSON.stringify([{ type: 0, value: '1', newvalue: 'Up' }]), fields: {} }), 'valuemapids')[0];
	await op('valuemap', 'getAll', { ...getCommon, valuemapids: '', hostids: [host] });
	await op('valuemap', 'update', { valuemapid: vmap, hostid: '', name: '', mappings: '', fields: { name: 'zzz-full-vmap2' } });
	const iface2 = ids(await op('hostinterface', 'create', { fields: { hostid: host, type: 1, main: 0, useip: 1, ip: '127.0.0.2', dns: '', port: '10060' } }), 'interfaceids')[0];
	await op('hostinterface', 'getAll', { ...getCommon, interfaceids: '', hostids: [host] });
	await op('hostinterface', 'update', { interfaceid: iface2, fields: { port: '10061' } });
	await op('hostinterface', 'massAdd', { massAddPayload: JSON.stringify({ hosts: [{ hostid: host }], interfaces: [{ type: 1, main: 0, useip: 1, ip: '127.0.0.3', dns: '', port: '10070' }] }) });
	await op('hostinterface', 'massRemove', { massRemovePayload: JSON.stringify({ hostids: [host], interfaces: [{ ip: '127.0.0.3', dns: '', port: '10070' }] }) });
	skip('hostinterface', 'replaceHostInterfaces', 'substituiria a interface principal usada pelos itens do host de teste');

	console.log('\n--- admin: user/group/role/token/macro/authn ---');
	const roles = j(await R('role').handlers.getAll.call(ctx({ ...getCommon, roleids: [] }), 0));
	exercised.add('role.getAll'); pass++; console.log('  ✅ role.getAll → ' + roles.length + ' roles');
	const role = ids(await op('role', 'create', { fields: { name: 'zzz-full-role', type: 1 } }), 'roleids')[0];
	await op('role', 'update', { roleid: role, fields: {} });
	const ug = ids(await op('usergroup', 'create', { fields: { name: 'zzz-full-ugroup' } }), 'usrgrpids')[0];
	await op('usergroup', 'getAll', { ...getCommon, usrgrpids: [], userids: [] });
	await op('usergroup', 'update', { usrgrpid: ug, fields: { users_status: 0 } });
	const user = ids(await op('user', 'create', { fields: { username: 'zzz-full-user', passwd: 'Sup3r-Secr3t-e2e!', roleid: role, usrgrps: JSON.stringify([{ usrgrpid: ug }]) } }), 'userids')[0];
	await op('user', 'getAll', { ...getCommon, userids: [], usrgrpids: [], roleids: [] });
	await op('user', 'update', { userid: user, fields: { name: 'ZZZ' } });
	await op('user', 'unblock', { unblockPayload: JSON.stringify([Number(user)]) });
	await opExpectError('user', 'resettotp', { resettotpPayload: JSON.stringify([Number(user)]) }, 'user.resettotp (sem TOTP → erro limpo)', /TOTP|token|secret|Invalid|not found/i);
	await opExpectError('user', 'provision', { provisionPayload: JSON.stringify([Number(user)]) }, 'user.provision (sem diretório → erro limpo)', /provision|directory|Invalid|IdP/i);
	await opExpectError('user', 'logout', {}, 'user.logout (token API não é sessão → erro limpo)', /token|session|API|logout/i);
	const tok = ids(await op('token', 'create', { fields: { name: 'zzz-full-token', userid: '1' } }), 'tokenids')[0];
	await op('token', 'getAll', { ...getCommon, tokenids: '', userids: [] });
	await op('token', 'update', { tokenid: tok, fields: { description: 'e2e' } });
	await op('token', 'generate', { generatePayload: JSON.stringify([tok]) }, 'token.generate');
	const gmac = ids(await op('usermacro', 'create', { macro: '{$ZZZFULL}', value: '1', macroDescription: '' }), 'globalmacroids')[0];
	await op('usermacro', 'getAll', { globalmacro: true, hostids: '', output: 'extend', options: {} });
	await op('usermacro', 'update', { globalmacroid: gmac, macro: '', value: '2', macroDescription: '' });
	const mfa = ids(await op('mfa', 'create', { fields: { name: 'zzz-full-mfa', type: 1, hash_function: 1, code_length: 6 } }), 'mfaids')[0];
	await op('mfa', 'getAll', { ...getCommon, mfaids: '' });
	await op('mfa', 'update', { mfaid: mfa, fields: {} });
	const udir = await op('userdirectory', 'create', { fields: { name: 'zzz-full-ldap', idp_type: 1, host: 'ldap.invalid', port: 389, base_dn: 'dc=zzz', search_attribute: 'uid' } });
	await op('userdirectory', 'getAll', { ...getCommon, userdirectoryids: '' });
	if (udir) {
		const udirId = ids(udir, 'userdirectoryids')[0];
		await op('userdirectory', 'update', { userdirectoryid: udirId, fields: {} });
		await opExpectError('userdirectory', 'test', { testPayload: JSON.stringify({ userdirectoryid: udirId, host: 'ldap.invalid', port: 389, base_dn: 'dc=zzz', search_attribute: 'uid', test_username: 'x', test_password: 'y' }) }, 'userdirectory.test (LDAP inexistente → erro limpo)', /LDAP|bind|connect|Invalid/i);
		await op('userdirectory', 'delete', { userdirectoryids: udirId });
	} else { ['update', 'test', 'delete'].forEach((o) => skip('userdirectory', o, 'create falhou')); }

	console.log('\n--- notificação/automação: mediatype/action/correlation/connector/proxy/drule ---');
	const mt = ids(await op('mediatype', 'create', { fields: { name: 'zzz-full-mt', type: 1, additionalParameters: JSON.stringify({ exec_path: 'dummy.sh' }) } }), 'mediatypeids')[0];
	await op('mediatype', 'getAll', { ...getCommon, mediatypeids: '' });
	await op('mediatype', 'update', { mediatypeid: mt, fields: { status: 1 } });
	const act = ids(await op('action', 'create', { fields: { name: 'zzz-full-action', eventsource: 0, status: 1, additionalParameters: JSON.stringify({ esc_period: '1h', operations: [{ operationtype: 0, opmessage: { default_msg: 1, mediatypeid: mt }, opmessage_grp: [{ usrgrpid: ug }] }], filter: { evaltype: 0, conditions: [{ conditiontype: 4, operator: 5, value: '2' }] } }) } }), 'actionids')[0];
	await op('action', 'getAll', { ...getCommon, actionids: '' });
	await op('action', 'update', { actionid: act, fields: { status: 1 } });
	const corr = ids(await op('correlation', 'create', { fields: { name: 'zzz-full-corr', filter: JSON.stringify({ evaltype: 0, conditions: [{ type: 1, tag: 'zzztag' }] }), operations: JSON.stringify([{ type: 0 }]) } }), 'correlationids')[0];
	await op('correlation', 'getAll', { ...getCommon, correlationids: '' });
	await op('correlation', 'update', { correlationid: corr, fields: { status: 1 } });
	const conn = ids(await op('connector', 'create', { fields: { name: 'zzz-full-conn', url: 'http://127.0.0.1:9999/sink', data_type: 0 } }), 'connectorids')[0];
	await op('connector', 'getAll', { ...getCommon, connectorids: '' });
	await op('connector', 'update', { connectorid: conn, fields: { status: 0 } });
	const pxg = ids(await op('proxygroup', 'create', { fields: { name: 'zzz-full-pxg', failover_delay: '1m', min_online: '1' } }), 'proxy_groupids')[0];
	await op('proxygroup', 'getAll', { ...getCommon, proxy_groupids: [] });
	await op('proxygroup', 'update', { proxy_groupid: pxg, fields: {} });
	const px = ids(await op('proxy', 'create', { fields: { name: 'zzz-full-proxy', operating_mode: 0 } }), 'proxyids')[0];
	await op('proxy', 'getAll', { ...getCommon, proxyids: [] });
	await op('proxy', 'update', { proxyid: px, fields: { description: 'e2e' } });
	const dr = ids(await op('drule', 'create', { fields: { name: 'zzz-full-drule', iprange: '192.168.255.1-2', delay: '1h', dchecks: JSON.stringify([{ type: 12 }]) } }), 'druleids')[0];
	await op('drule', 'getAll', { ...getCommon, druleids: '' });
	await op('drule', 'update', { druleid: dr, fields: { status: 1 } });
	await op('dcheck', 'getAll', { dcheckids: '', druleids: dr, output: 'extend', options: {} });
	await op('dhost', 'getAll', { dhostids: '', druleids: '', selects: [], output: 'extend', options: {} });
	await op('dservice', 'getAll', { dserviceids: '', druleids: '', dhostids: '', selects: [], output: 'extend', options: {} });

	console.log('\n--- serviços/SLA/relatórios/regexp/scripts ---');
	const svc = ids(await op('service', 'create', { fields: { name: 'zzz-full-svc', algorithm: 0, sortorder: 0, problem_tags: JSON.stringify([{ tag: 'zzzsvc' }]) } }), 'serviceids')[0];
	await op('service', 'getAll', { ...getCommon, serviceids: '' });
	await op('service', 'update', { serviceid: svc, fields: { sortorder: 1 } });
	const sla = ids(await op('sla', 'create', { name: 'zzz-full-sla', timezone: 'UTC', period: 2, slo: '99.9', effective_date: Math.floor(Date.now() / 1000) - 86400, service_tags: JSON.stringify([{ tag: 'zzzsvc' }]), fields: {} }), 'slaids')[0];
	await op('sla', 'getAll', { ...getCommon, slaids: '' });
	await op('sla', 'update', { slaid: sla, name: '', slo: '', service_tags: '', effective_date: '', fields: { slo: '99.5' } });
	await op('sla', 'getSli', { getSliPayload: JSON.stringify({ slaid: sla, serviceids: [svc], periods: 1 }) }, 'sla.getSli');
	const rep = await op('report', 'create', { fields: { name: 'zzz-full-report', userid: '1', dashboardid: dash, users: JSON.stringify([{ userid: '1' }]) } });
	await op('report', 'getAll', { ...getCommon, reportids: '' });
	if (rep) {
		const repId = ids(rep, 'reportids')[0];
		await op('report', 'update', { reportid: repId, fields: { description: 'e2e' } });
		await op('report', 'delete', { reportids: repId });
	} else { ['update', 'delete'].forEach((o) => skip('report', o, 'create falhou')); }
	const rx = ids(await op('regexp', 'create', { fields: { name: 'zzz-full-rx', test_string: 'zzz1', expressions: JSON.stringify([{ expression: '^zzz', expression_type: 0, case_sensitive: 0 }]) } }), 'regexpids')[0];
	await op('regexp', 'getAll', { ...getCommon, regexpids: '' });
	await op('regexp', 'update', { regexpid: rx, fields: {} });
	const scr = ids(await op('script', 'create', { name: 'zzz-full-script', command: 'echo full-e2e', fields: { type: 0, scope: 2, groupid: '0', additionalParameters: JSON.stringify({ execute_on: 1 }) } }), 'scriptids')[0];
	await op('script', 'getAll', { ...getCommon, scriptids: '' });
	await op('script', 'update', { scriptid: scr, name: '', command: '', fields: { description: 'e2e' } });
	await op('script', 'getScriptsByHosts', { byHostids: host });
	if (eventid) await op('script', 'getScriptsByEvents', { byEventids: eventid });
	else skip('script', 'getScriptsByEvents', 'sem evento gerado');
	await opExpectError('script', 'execute', { scriptid: scr, hostid: host, eventid: '' }, 'script.execute (echo no server; ok ou global-scripts-disabled)', /global script|disabled|EnableGlobalScripts|not allowed|permission/i);

	console.log('\n--- templates: CRUD + mass + dashboards ---');
	const tg = ids(await op('templategroup', 'create', { name: 'zzz-full-tg', fields: {} }), 'groupids')[0];
	const tg2 = ids(await op('templategroup', 'create', { name: 'zzz-full-tg/sub', fields: {} }, 'templategroup.create (sub)'), 'groupids')[0];
	await op('templategroup', 'getAll', { ...getCommon, groupids: [], nameSearch: 'zzz-full' });
	await op('templategroup', 'update', { groupid: tg2, fields: { name: 'zzz-full-tg/sub2' } });
	const tpl = ids(await op('template', 'create', { host: 'zzz-full-tpl', groups: tg, fields: {} }), 'templateids')[0];
	const tpl2 = ids(await op('template', 'create', { host: 'zzz-full-tpl2', groups: tg, fields: {} }, 'template.create (2º p/ mass)'), 'templateids')[0];
	await op('template', 'getAll', { ...getCommon, templateids: [], groupids: [], hostids: [] });
	await op('template', 'update', { templateid: tpl, fields: { description: 'e2e' } });
	await op('template', 'massAdd', { massAddPayload: JSON.stringify({ templates: [{ templateid: tpl }], macros: [{ macro: '{$MASS}', value: '1' }] }) });
	await op('template', 'massUpdate', { massUpdatePayload: JSON.stringify({ templates: [{ templateid: tpl }], groups: [{ groupid: tg }] }) });
	await op('template', 'massRemove', { massRemovePayload: JSON.stringify({ templateids: [tpl], macros: ['{$MASS}'] }) });
	await op('templategroup', 'massAdd', { massAddPayload: JSON.stringify({ groups: [{ groupid: tg2 }], templates: [{ templateid: tpl2 }] }) });
	await op('templategroup', 'massRemove', { massRemovePayload: JSON.stringify({ groupids: [tg2], templateids: [tpl2] }) });
	await op('templategroup', 'massUpdate', { massUpdatePayload: JSON.stringify({ groups: [{ groupid: tg }], templates: [{ templateid: tpl }, { templateid: tpl2 }] }) });
	await op('templategroup', 'propagate', { propagatePayload: JSON.stringify({ groups: [{ groupid: tg }], permissions: true }) });
	const tdash = ids(await op('templatedashboard', 'create', { fields: { name: 'zzz-full-tdash', templateid: tpl, pages: JSON.stringify([{}]) } }), 'dashboardids')[0];
	await op('templatedashboard', 'getAll', { ...getCommon, dashboardids: '', templateids: [tpl] });
	await op('templatedashboard', 'update', { dashboardid: tdash, fields: { display_period: 60 } });

	console.log('\n--- host mass + module/hanode/auditlog ---');
	await op('host', 'massAdd', { massHostids: host, massPayload: JSON.stringify({ templates: [{ templateid: tpl }] }) });
	await op('host', 'massRemove', { massHostids: host, massPayload: JSON.stringify({ templateids_clear: [tpl] }) });
	await op('host', 'massUpdate', { massHostids: host, massPayload: JSON.stringify({ status: 0 }) });
	await op('host', 'getAll', { ...getCommon, hostids: [], groupids: [hg], templateids: [] });
	await op('host', 'update', { hostid: host, additionalFields: { description: 'e2e-full' } });
	await op('module', 'getAll', { ...getCommon, moduleids: '' });
	['create', 'update', 'delete'].forEach((o) => skip('module', o, 'exige diretório de módulo frontend no filesystem do container'));
	await op('hanode', 'getAll', { ha_nodeids: '', output: 'extend', options: {} });
	await op('auditlog', 'getAll', { auditids: '', userids: [], output: 'extend', options: { limit: 3 } });

	console.log('\n--- config global (get+update) ---');
	await op('settings', 'get', { output: 'extend' });
	await op('settings', 'update', { updateParams: JSON.stringify({ login_attempts: 5 }) });
	await op('housekeeping', 'get', { output: 'extend' });
	await op('housekeeping', 'update', { updateParams: JSON.stringify({ hk_events_mode: 1 }) });
	await op('authentication', 'get', { output: 'extend' });
	await op('authentication', 'update', { updateParams: JSON.stringify({ passwd_min_length: 8 }) });
	await op('autoregistration', 'get', { output: 'extend' });
	await op('autoregistration', 'update', { updateParams: JSON.stringify({ tls_accept: 1 }) });

	console.log('\n--- configuration export/import ---');
	const exp = await op('configuration', 'export', { format: 'json', exportOptions: JSON.stringify({ hosts: [host] }) });
	if (exp) {
		const source = exp[0].result ?? exp[0];
		const rules = { host_groups: { createMissing: true, updateExisting: true }, hosts: { createMissing: true, updateExisting: true }, items: { createMissing: true, updateExisting: true }, discoveryRules: { createMissing: true, updateExisting: true }, triggers: { createMissing: true, updateExisting: true }, graphs: { createMissing: true, updateExisting: true }, httptests: { createMissing: true, updateExisting: true }, valueMaps: { createMissing: true, updateExisting: true }, templateLinkage: { createMissing: true } };
		await op('configuration', 'importcompare', { format: 'json', source: typeof source === 'string' ? source : JSON.stringify(source), rules: JSON.stringify(rules) });
		await op('configuration', 'import', { format: 'json', source: typeof source === 'string' ? source : JSON.stringify(source), rules: JSON.stringify(rules) }, 'configuration.import (reimporta o próprio host)');
	} else { skip('configuration', 'importcompare', 'export falhou'); skip('configuration', 'import', 'export falhou'); }

	console.log('\n--- maintenance ---');
	const mnt = ids(await op('maintenance', 'create', { name: 'zzz-full-mnt', active_since: new Date(Date.now() + 3600e3).toISOString(), active_till: new Date(Date.now() + 7200e3).toISOString(), timeperiods: { periodItems: [{ timeperiod_type: 0, start_date: new Date(Date.now() + 3600e3).toISOString(), period: 3600 }] }, fields: { groups: [hg] } }), 'maintenanceids')[0];
	await op('maintenance', 'getAll', { ...getCommon, maintenanceids: '', groupids: [hg], hostids: [] });
	await op('maintenance', 'update', { maintenanceid: mnt, name: '', active_since: '', active_till: '', timeperiods: {}, fields: { description: 'e2e' } });

	console.log('\n--- history.clear + deletes (ordem reversa) ---');
	await op('history', 'clear', { clearItemids: trapper });
	const del = (r, p) => op(r, 'delete', p);
	await del('maintenance', { maintenanceids: mnt });
	await del('templatedashboard', { dashboardids: tdash });
	await del('template', { templateids: [tpl, tpl2].join(',') });
	await del('templategroup', { groupids: [tg, tg2].join(',') });
	await del('script', { scriptids: scr });
	await del('regexp', { regexpids: rx });
	await del('sla', { slaids: sla });
	await del('service', { serviceids: svc });
	await del('drule', { druleids: dr });
	await del('proxy', { proxyids: px });
	await del('proxygroup', { proxy_groupids: pxg });
	await del('connector', { connectorids: conn });
	await del('correlation', { correlationids: corr });
	await del('action', { actionids: act });
	await del('mediatype', { mediatypeids: mt });
	await del('mfa', { mfaids: mfa });
	await del('usermacro', { globalmacroids: gmac });
	await del('token', { tokenids: tok });
	await del('user', { userids: user });
	await del('usergroup', { usrgrpids: ug });
	await del('role', { roleids: role });
	await del('iconmap', { iconmapids: imap });
	await del('image', { imageids: img });
	await del('map', { sysmapids: map });
	await del('dashboard', { dashboardids: dash });
	await del('httptest', { httptestids: web });
	await del('valuemap', { valuemapids: vmap });
	await del('hostinterface', { interfaceids: iface2 });
	await del('graph', { graphids: graph });
	await del('hostprototype', { hostids: hproto });
	await del('graphprototype', { graphids: gproto });
	await del('triggerprototype', { triggerids: tproto });
	await del('itemprototype', { itemids: iproto });
	await del('discoveryrule', { itemids: lld });
	await del('trigger', { triggerids: trg });
	await del('item', { itemids: [trapper, internal].join(',') });
	await del('host', { hostids: host });
	await del('hostgroup', { groupids: [hg, hg2].join(',') });

	// -------- cobertura --------
	console.log('\n=== COBERTURA ===');
	let total = 0, covered = 0, skippedCount = 0;
	const missing = [];
	for (const [rname, mod] of Object.entries(resources)) {
		for (const opName of Object.keys(mod.handlers)) {
			total++;
			const key = `${rname}.${opName}`;
			if (exercised.has(key)) covered++;
			else if (skipped.has(key)) { skippedCount++; console.log(`  ⏭️  ${key} — ${skipped.get(key)}`); }
			else missing.push(key);
		}
	}
	console.log(`\nOperações: ${total} | exercitadas: ${covered} | skip justificado: ${skippedCount} | NÃO cobertas: ${missing.length}`);
	if (missing.length) missing.forEach((m) => console.log('  ⚠️  ' + m));
	console.log(`\n=== RESULTADO: ${pass} ✅ | ${fail} ❌ ===`);
	if (failures.length) { console.log('FALHAS:'); failures.forEach((f) => console.log('  ✗ ' + f)); }
	process.exit(fail || missing.length ? 1 : 0);
})().catch((e) => { console.error('FATAL:', e); process.exit(1); });
