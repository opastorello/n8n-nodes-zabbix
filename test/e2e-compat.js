// Cross-version check of the operations Zabbix 8.0 removed (*.massupdate):
// run them through the node's handlers and assert the resulting state, which
// must be identical on 7.4 (native method) and 8.0+ (transport rebuilds them).
// Runs against a DISPOSABLE Zabbix; creates and deletes zzz-compat-* objects.
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BASE = (process.env.ZABBIX_URL || 'http://127.0.0.1:8089').replace(/\/+$/, '');
const TOKEN = process.env.ZABBIX_TOKEN;
if (!TOKEN) throw new Error('Set ZABBIX_TOKEN (node test/create-token.js <url>)');
if (!['127.0.0.1', 'localhost', '::1'].includes(new URL(BASE).hostname) && process.env.E2E_ALLOW_REMOTE !== '1') {
	console.error('ABORTED: ' + BASE + ' is not local. Set E2E_ALLOW_REMOTE=1 to override.');
	process.exit(2);
}

const { resources } = require(path.join(ROOT, 'dist/nodes/Zabbix/actions/index.js'));

async function httpRequest(o) {
	const res = await fetch(o.url, { method: 'POST', headers: o.headers, body: JSON.stringify(o.body) });
	return res.json();
}
let version = { major: 0, minor: 0 };
const atLeast = (major, minor) => version.major > major || (version.major === major && version.minor >= minor);
async function api(method, params) {
	// Zabbix < 6.4 takes the token in the body, not a header.
	const legacy = !atLeast(6, 4);
	const body = await httpRequest({
		url: BASE + '/api_jsonrpc.php',
		headers: { 'Content-Type': 'application/json-rpc', ...(legacy ? {} : { Authorization: 'Bearer ' + TOKEN }) },
		body: { jsonrpc: '2.0', method, params, id: 1, ...(legacy ? { auth: TOKEN } : {}) },
	});
	if (body.error) throw new Error(method + ': ' + body.error.message + ' ' + body.error.data);
	return body.result;
}
const ctx = (params) => ({
	getCredentials: async () => ({ url: BASE, apiToken: TOKEN }),
	getNode: () => ({ name: 'Zabbix' }), getTimezone: () => 'America/Sao_Paulo',
	helpers: { httpRequest },
	getNodeParameter: (n, i, d) => (n in params ? params[n] : d),
});
const run = (resource, operation, params) => resources[resource].handlers[operation].call(ctx(params), 0);

const sorted = (list) => [...list].map(String).sort();
let passed = 0;
function expectSame(label, actual, expected) {
	const a = JSON.stringify(sorted(actual));
	const e = JSON.stringify(sorted(expected));
	if (a !== e) throw new Error(label + ': expected ' + e + ', got ' + a);
	passed++;
	console.log('  ✅ ' + label + ' → ' + a);
}

async function cleanup() {
	const hosts = await api('host.get', { output: ['hostid'], search: { host: 'zzz-compat' } });
	if (hosts.length) await api('host.delete', hosts.map((h) => h.hostid));
	const templates = await api('template.get', { output: ['templateid'], search: { host: 'zzz-compat' } });
	if (templates.length) await api('template.delete', templates.map((t) => t.templateid));
	const hgs = await api('hostgroup.get', { output: ['groupid'], search: { name: 'zzz-compat' } });
	if (hgs.length) await api('hostgroup.delete', hgs.map((g) => g.groupid));
	if (!atLeast(6, 2)) return;
	const tgs = await api('templategroup.get', { output: ['groupid'], search: { name: 'zzz-compat' } });
	if (tgs.length) await api('templategroup.delete', tgs.map((g) => g.groupid));
}

(async () => {
	const reply = await httpRequest({
		url: BASE + '/api_jsonrpc.php',
		headers: { 'Content-Type': 'application/json-rpc' },
		body: { jsonrpc: '2.0', method: 'apiinfo.version', params: {}, id: 1 },
	});
	const [major, minor] = String(reply.result).split('.').map(Number);
	version = { major, minor };
	console.log('=== Compat (*.massupdate) contra Zabbix ' + reply.result + ' em ' + BASE + ' ===');
	await cleanup();

	const [A] = (await api('hostgroup.create', { name: 'zzz-compat-A' })).groupids;
	const [B] = (await api('hostgroup.create', { name: 'zzz-compat-B' })).groupids;
	const mkHost = async (host, groups) =>
		(await api('host.create', { host, groups: groups.map((groupid) => ({ groupid })) })).hostids[0];
	const h1 = await mkHost('zzz-compat-h1', [A]);
	const h2 = await mkHost('zzz-compat-h2', [A]);
	const h3 = await mkHost('zzz-compat-h3', [A, B]);
	const membersOf = async (groupid) =>
		(await api('host.get', { groupids: [groupid], output: ['hostid'] })).map((h) => h.hostid);

	// host.massupdate: same properties on several hosts, groups replaced
	await run('host', 'massUpdate', { massHostids: `${h1},${h2}`, massPayload: JSON.stringify({ status: 1, groups: [{ groupid: B }] }) });
	// 6.2 renamed selectGroups/groups to selectHostGroups/hostgroups.
	const groupSelect = atLeast(6, 2) ? 'selectHostGroups' : 'selectGroups';
	const groupKey = atLeast(6, 2) ? 'hostgroups' : 'groups';
	const after = await api('host.get', { hostids: [h1, h2], output: ['status'], [groupSelect]: ['groupid'] });
	expectSame('host.massupdate status', after.map((h) => h.status), ['1', '1']);
	expectSame('host.massupdate groups', after.flatMap((h) => h[groupKey].map((g) => g.groupid)), [B, B]);

	// hostgroup.massupdate: B ends up with exactly the listed hosts
	await run('hostgroup', 'massUpdate', { massUpdatePayload: JSON.stringify({ groups: [{ groupid: B }], hosts: [{ hostid: h1 }, { hostid: h2 }, { hostid: h3 }] }) });
	expectSame('hostgroup.massupdate add', await membersOf(B), [h1, h2, h3]);
	await run('host', 'massUpdate', { massHostids: `${h1},${h2}`, massPayload: JSON.stringify({ groups: [{ groupid: A }, { groupid: B }] }) });
	await run('hostgroup', 'massUpdate', { massUpdatePayload: JSON.stringify({ groups: [{ groupid: B }], hosts: [{ hostid: h2 }] }) });
	expectSame('hostgroup.massupdate replace', await membersOf(B), [h2]);
	expectSame('hostgroup.massupdate keeps other groups', await membersOf(A), [h1, h2, h3]);

	// templates (before 6.2 they live in host groups; template groups don't exist)
	const tplGroups = atLeast(6, 2);
	const mkGroup = async (name) =>
		(await api(tplGroups ? 'templategroup.create' : 'hostgroup.create', { name })).groupids[0];
	const TG = await mkGroup('zzz-compat-TG');
	const TG2 = await mkGroup('zzz-compat-TG2');
	const mkTpl = async (host) => (await api('template.create', { host, groups: [{ groupid: TG }] })).templateids[0];
	const t1 = await mkTpl('zzz-compat-t1');
	const t2 = await mkTpl('zzz-compat-t2');
	const tlink = await mkTpl('zzz-compat-tlink');

	await run('template', 'massUpdate', { massUpdatePayload: JSON.stringify({ templates: [{ templateid: t1 }, { templateid: t2 }], templates_link: [{ templateid: tlink }], groups: [{ groupid: TG }, { groupid: TG2 }] }) });
	const tplGroupSelect = tplGroups ? 'selectTemplateGroups' : 'selectGroups';
	const tplGroupKey = tplGroups ? 'templategroups' : 'groups';
	const tpls = await api('template.get', { templateids: [t1, t2], output: ['templateid'], selectParentTemplates: ['templateid'], [tplGroupSelect]: ['groupid'] });
	expectSame('template.massupdate templates_link', tpls.flatMap((t) => t.parentTemplates.map((p) => p.templateid)), [tlink, tlink]);
	expectSame('template.massupdate groups', tpls.flatMap((t) => t[tplGroupKey].map((g) => g.groupid)), [TG, TG2, TG, TG2]);

	if (tplGroups) {
		const tplMembersOf = async (groupid) =>
			(await api('template.get', { groupids: [groupid], output: ['templateid'] })).map((t) => t.templateid);
		await run('templategroup', 'massUpdate', { massUpdatePayload: JSON.stringify({ groups: [{ groupid: TG2 }], templates: [{ templateid: t2 }] }) });
		expectSame('templategroup.massupdate replace', await tplMembersOf(TG2), [t2]);
		expectSame('templategroup.massupdate keeps other groups', await tplMembersOf(TG), [t1, t2, tlink]);
	} else {
		console.log('  ⏭  templategroup.massupdate — template groups only exist from Zabbix 6.2');
	}

	// Host → Link Templates must ADD (host.massadd), never replace the linked list.
	// (Fresh templates: t1/t2 both inherit tlink, and Zabbix refuses linking two
	// templates with the same parent to one host.)
	const ta = await mkTpl('zzz-compat-ta');
	const tb = await mkTpl('zzz-compat-tb');
	await api('host.update', { hostid: h3, templates: [{ templateid: ta }] });
	await run('host', 'linkTemplates', { targetHostids: [h3], templateIds: [tb] });
	const linkedOf = async (hostid) =>
		(await api('host.get', { hostids: [hostid], output: ['hostid'], selectParentTemplates: ['templateid'] }))[0].parentTemplates.map((t) => t.templateid);
	expectSame('host Link Templates keeps existing templates', await linkedOf(h3), [ta, tb]);
	await run('host', 'unlinkTemplates', { targetHostids: [h3], templateIds: [tb], clearTemplateData: true });
	expectSame('host Unlink Templates removes only the chosen one', await linkedOf(h3), [ta]);

	// A read-only credential must block every write before it reaches Zabbix.
	const readOnly = { ...ctx({ targetHostids: [h3] }), getCredentials: async () => ({ url: BASE, apiToken: TOKEN, readOnly: true }) };
	let blocked = false;
	try {
		await resources.host.handlers.disable.call(readOnly, 0);
	} catch (e) {
		blocked = /read-only|Blocked/i.test(e.message + ' ' + (e.description ?? ''));
	}
	const stillEnabled = (await api('host.get', { hostids: [h3], output: ['status'] }))[0].status;
	expectSame('read-only credential blocks writes', [String(blocked), stillEnabled], ['true', '0']);
	const readable = await resources.host.handlers.getAll.call({ ...readOnly, getNodeParameter: (n, i, d) => ({ hostids: h3, output: 'extend', options: {} })[n] ?? d }, 0);
	expectSame('read-only credential still reads', [String(readable.length)], ['1']);

	const statusOf = async (hostids) =>
		(await api('host.get', { hostids, output: ['status'] })).map((h) => h.status);
	await run('host', 'disable', { targetHostids: [h1, h3] });
	expectSame('host Disable (two hosts, one call)', await statusOf([h1, h3]), ['1', '1']);
	await run('host', 'enable', { targetHostids: [h1, h3] });
	expectSame('host Enable', await statusOf([h1, h3]), ['0', '0']);

	await cleanup();
	console.log('=== COMPAT: ' + passed + ' ✅ ===');
})().catch(async (e) => {
	console.error('FALHA:', e.message, e.description ?? '');
	try {
		await cleanup();
	} catch {
		/* best effort */
	}
	process.exit(1);
});
