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
		getNode: () => ({ name: 'Zabbix' }),
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
