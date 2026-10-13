// Smoke suite: exercises every operation against a mocked transport and
// asserts each one builds a valid JSON-RPC request. Run: npm run test:smoke
// Exercises every Zabbix resource handler against a mocked JSON-RPC transport.
// Confirms each of the 171 operations builds a valid request without throwing.
const path = require('path');
const root = require('path').join(__dirname, '..');
const { resources, resourceOptions } = require(path.join(root, 'dist/nodes/Zabbix/actions/index.js'));

// Heuristic parameter provider: returns something plausible for any param name.
function paramValue(name, def) {
	if (name === 'operation' || name === 'resource') return def;
	if (name === 'method') return 'apiinfo.version';
	if (name === 'output') return 'extend';
	if (name === 'format') return 'json';
	if (name === 'source') return '<zabbix_export/>';
	if (name === 'selects') return [];
	if (name === 'action') return [1, 2, 4];
	if (name === 'globalmacro') return true;
	if (name === 'fields' || name === 'options' || name === 'additionalFields') return {};
	if (/(^|[a-z])ids$/i.test(name)) return '1,2';
	if (/params|filter|search|payload|Parameters|rules|Options|Values|values|mappings|timeperiods|tags|steps|gitems|rules/i.test(name))
		return '{}';
	if (/severity|time_|active_|limit|width|height|delay_num|display_period|sortorder_num/i.test(name)) return 0;
	if (/id$/i.test(name)) return '1';
	return '1';
}

function makeCtx(op, cap) {
	return {
		getCredentials: async () => ({ url: 'https://z.test/zabbix/', apiToken: 'tok' }),
		getNode: () => ({ name: 'Zabbix' }), getTimezone: () => 'America/Sao_Paulo',
		getMode: () => 'manual',
		getWorkflowStaticData: () => ({}),
		continueOnFail: () => false,
		getNodeParameter: (name, i, def) => paramValue(name, def),
		helpers: {
			httpRequestWithAuthentication: async (cred, o) => {
				cap.cred = cred;
				cap.method = o.body.method;
				cap.params = o.body.params;
				cap.url = o.url;
				return { jsonrpc: '2.0', id: 1, result: [{ id: '1' }] };
			},
			// apiinfo.version goes through the unauthenticated path.
			httpRequest: async (o) => {
				cap.cred = 'zabbixTokenApi';
				cap.method = o.body.method;
				cap.params = o.body.params;
				cap.url = o.url;
				return { jsonrpc: '2.0', id: 1, result: '7.4.0' };
			},
		},
	};
}

(async () => {
	let total = 0, ok = 0, fail = 0;
	const failures = [];
	const methods = new Set();

	for (const opt of resourceOptions) {
		const mod = resources[opt.value];
		for (const [opName, handler] of Object.entries(mod.handlers)) {
			total++;
			const cap = {};
			try {
				const out = await handler.call(makeCtx(opName, cap), 0);
				if (!Array.isArray(out)) throw new Error('handler did not return an array');
				if (!cap.method || !cap.method.includes('.')) throw new Error('no JSON-RPC method emitted: ' + cap.method);
				if (cap.cred !== 'zabbixTokenApi') throw new Error('wrong credential: ' + cap.cred);
				if (!/\/api_jsonrpc\.php$/.test(cap.url)) throw new Error('bad url: ' + cap.url);
				methods.add(cap.method);
				ok++;
			} catch (e) {
				fail++;
				failures.push(`${opt.value}.${opName} -> ${e.message}`);
			}
		}
	}

	// Zabbix 8.0 removed the four *.massupdate methods; the transport rebuilds
	// them. Mock an 8.0 server (and a 7.4 → 8.0 upgrade with a stale cached
	// version) and assert the calls actually sent.
	const { zabbixApiRequest } = require(path.join(root, 'dist/nodes/Zabbix/transport/index.js'));
	const compatCtx = (url, version, members = []) => {
		const calls = [];
		return {
			calls,
			getCredentials: async () => ({ url, apiToken: 'tok' }),
			getNode: () => ({ name: 'Zabbix' }), getTimezone: () => 'America/Sao_Paulo',
			helpers: {
				httpRequest: async (o) => {
					const { method, params } = o.body;
					calls.push({ method, params });
					if (method === 'apiinfo.version') return { jsonrpc: '2.0', id: 1, result: version };
					if (/\.massupdate$/.test(method) && !version.startsWith('7'))
						return { jsonrpc: '2.0', id: 1, error: { code: -32601, message: 'Method not found.', data: '' } };
					if (/^(host|template)\.get$/.test(method)) return { jsonrpc: '2.0', id: 1, result: members };
					return { jsonrpc: '2.0', id: 1, result: { ok: true } };
				},
			},
		};
	};
	const sent = (ctx) => ctx.calls.filter((c) => c.method !== 'apiinfo.version');
	const compatChecks = [
		['host.massupdate on 8.0 → host.update per host', async () => {
			const ctx = compatCtx('https://z8a.test', '8.0.0');
			await zabbixApiRequest.call(ctx, 'host.massupdate', { hosts: [{ hostid: '1' }, { hostid: '2' }], status: 1 });
			const s = sent(ctx);
			return s.length === 1 && s[0].method === 'host.update' &&
				JSON.stringify(s[0].params) === JSON.stringify([{ hostid: '1', status: 1 }, { hostid: '2', status: 1 }]);
		}],
		['template.massupdate on 8.0 → templates_link becomes templates', async () => {
			const ctx = compatCtx('https://z8b.test', '8.0.0');
			await zabbixApiRequest.call(ctx, 'template.massupdate', { templates: [{ templateid: '5' }], templates_link: [{ templateid: '9' }] });
			const s = sent(ctx);
			return s[0].method === 'template.update' &&
				JSON.stringify(s[0].params) === JSON.stringify([{ templateid: '5', templates: [{ templateid: '9' }] }]);
		}],
		['hostgroup.massupdate on 8.0 → massadd + massremove (discovered hosts kept)', async () => {
			const ctx = compatCtx('https://z8c.test', '8.0.0', [
				{ hostid: '1', flags: '0' }, { hostid: '3', flags: '0' }, { hostid: '4', flags: '4' },
			]);
			await zabbixApiRequest.call(ctx, 'hostgroup.massupdate', { groups: [{ groupid: '7' }], hosts: [{ hostid: '1' }, { hostid: '2' }] });
			const s = sent(ctx).map((c) => c.method + ' ' + JSON.stringify(c.params));
			return JSON.stringify(s) === JSON.stringify([
				'host.get {"groupids":["7"],"output":["hostid","flags"]}',
				'hostgroup.massadd {"groups":[{"groupid":"7"}],"hosts":[{"hostid":"1"},{"hostid":"2"}]}',
				'hostgroup.massremove {"groupids":["7"],"hostids":["3"]}',
			]);
		}],
		['host.massupdate on 7.4 → native call', async () => {
			const ctx = compatCtx('https://z7.test', '7.4.0');
			await zabbixApiRequest.call(ctx, 'host.massupdate', { hosts: [{ hostid: '1' }], status: 1 });
			return sent(ctx).map((c) => c.method).join() === 'host.massupdate';
		}],
		['upgraded to 8.0 while cached as 7.4 → falls back to the rebuild', async () => {
			const old = compatCtx('https://zup.test', '7.4.0');
			await zabbixApiRequest.call(old, 'host.massupdate', { hosts: [{ hostid: '1' }] });
			const ctx = compatCtx('https://zup.test', '8.0.0');
			await zabbixApiRequest.call(ctx, 'host.massupdate', { hosts: [{ hostid: '1' }], status: 0 });
			return sent(ctx).map((c) => c.method).join() === 'host.massupdate,host.update';
		}],
	];
	// Transport: read-only gate, auth placement by version, username/password sessions.
	const transportCtx = (url, version, credentials = {}, onCall = () => undefined) => {
		const calls = [];
		return {
			calls,
			getCredentials: async () => ({ url, apiToken: 'tok', ...credentials }),
			getNode: () => ({ name: 'Zabbix' }),
			helpers: {
				httpRequest: async (o) => {
					calls.push({ method: o.body.method, auth: o.body.auth, header: o.headers.Authorization, headers: o.headers });
					if (o.body.method === 'apiinfo.version') return { jsonrpc: '2.0', id: 1, result: version };
					const custom = onCall(o, calls);
					return custom ?? { jsonrpc: '2.0', id: 1, result: [] };
				},
			},
		};
	};
	const rejects = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };
	compatChecks.push(
		['read-only blocks writes without calling Zabbix', async () => {
			const ctx = transportCtx('https://ro.test', '7.4.0', { readOnly: true });
			const err = await rejects(() => zabbixApiRequest.call(ctx, 'host.update', { hostid: '1', status: 1 }));
			return /Blocked/.test(err?.message ?? '') && ctx.calls.length === 0;
		}],
		['read-only still allows reads', async () => {
			const ctx = transportCtx('https://ro2.test', '7.4.0', { readOnly: true });
			await zabbixApiRequest.call(ctx, 'host.get', {});
			return sent(ctx).map((c) => c.method).join() === 'host.get';
		}],
		['Zabbix 6.0 gets the token in the body, not a header', async () => {
			const ctx = transportCtx('https://z60.test', '6.0.48');
			await zabbixApiRequest.call(ctx, 'host.get', {});
			const call = sent(ctx)[0];
			return call.auth === 'tok' && call.header === undefined;
		}],
		['Zabbix 6.4+ gets a Bearer header, no body auth', async () => {
			const ctx = transportCtx('https://z64.test', '6.4.21');
			await zabbixApiRequest.call(ctx, 'host.get', {});
			const call = sent(ctx)[0];
			return call.header === 'Bearer tok' && call.auth === undefined;
		}],
		['extra headers are sent with every call', async () => {
			const ctx = transportCtx('https://hdr.test', '7.4.0', { extraHeaders: '{"CF-Access-Client-Id":"abc"}' });
			await zabbixApiRequest.call(ctx, 'host.get', {});
			return ctx.calls.every((c) => c.headers['CF-Access-Client-Id'] === 'abc');
		}],
		['username/password: logs in once, re-logs in when the session expires', async () => {
			let logins = 0;
			let expireNext = false;
			const ctx = transportCtx('https://pw.test', '7.4.0', { authentication: 'password', username: 'u', password: 'p' }, (o) => {
				if (o.body.method === 'user.login') { logins++; return { jsonrpc: '2.0', id: 1, result: 'session' + logins }; }
				if (expireNext && o.headers.Authorization === 'Bearer session1') {
					expireNext = false;
					return { jsonrpc: '2.0', id: 1, error: { code: -32602, message: 'Invalid params.', data: 'Session terminated, re-login, please.' } };
				}
				return undefined;
			});
			await zabbixApiRequest.call(ctx, 'host.get', {});
			await zabbixApiRequest.call(ctx, 'host.get', {});
			expireNext = true;
			await zabbixApiRequest.call(ctx, 'host.get', {});
			const lastGet = ctx.calls.filter((c) => c.method === 'host.get').pop();
			return logins === 2 && lastGet.header === 'Bearer session2';
		}],
	);
	for (const [label, check] of compatChecks) {
		total++;
		try {
			if (!(await check())) throw new Error('unexpected calls');
			ok++;
		} catch (e) {
			fail++;
			failures.push(`compat: ${label} -> ${e.message}`);
		}
	}

	console.log(`Operations exercised: ${total} | OK: ${ok} | FAIL: ${fail}`);
	console.log(`Distinct JSON-RPC methods emitted: ${methods.size}`);
	if (failures.length) {
		console.log('\nFAILURES:');
		failures.forEach((f) => console.log('  ✗ ' + f));
		process.exit(1);
	} else {
		console.log('\nAll operations built a valid JSON-RPC request. ✅');
		console.log('\nSample of methods:', [...methods].sort().slice(0, 20).join(', '), '...');
	}
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(1); });
