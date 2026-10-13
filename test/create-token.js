// Create an API token on a DISPOSABLE local Zabbix (default Admin/zabbix login)
// and print it. Waits for the frontend to come up first.
//   ZABBIX_TOKEN=$(node test/create-token.js http://127.0.0.1:8089)
const BASE = (process.argv[2] || process.env.ZABBIX_URL || 'http://127.0.0.1:8089').replace(/\/+$/, '');

if (!['127.0.0.1', 'localhost', '::1'].includes(new URL(BASE).hostname)) {
	console.error('ABORTED: ' + BASE + ' is not local — this script logs in with the default Admin password.');
	process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let legacyAuth = false; // Zabbix < 6.4 takes the session in the body, not a header

async function call(method, params, auth) {
	const headers = { 'Content-Type': 'application/json-rpc' };
	const request = { jsonrpc: '2.0', method, params, id: 1 };
	if (auth && legacyAuth) request.auth = auth;
	else if (auth) headers.Authorization = 'Bearer ' + auth;
	const res = await fetch(BASE + '/api_jsonrpc.php', {
		method: 'POST',
		headers,
		body: JSON.stringify(request),
	});
	const body = await res.json();
	if (body.error) throw new Error(method + ': ' + body.error.message + ' ' + body.error.data);
	return body.result;
}

(async () => {
	let version;
	for (let attempt = 0; attempt < 60 && !version; attempt++) {
		try {
			version = await call('apiinfo.version', {});
		} catch {
			await sleep(5000);
		}
	}
	if (!version) throw new Error('Zabbix API at ' + BASE + ' never came up');
	const [major, minor] = version.split('.').map(Number);
	legacyAuth = major < 6 || (major === 6 && minor < 4);

	const session = await call('user.login', { username: 'Admin', password: 'zabbix' });
	const [tokenid] = (await call('token.create', { name: 'e2e-' + Date.now(), userid: '1' }, session)).tokenids;
	const [{ token }] = await call('token.generate', [tokenid], session);
	console.error('Zabbix ' + version + ' at ' + BASE);
	console.log(token);
})().catch((e) => {
	console.error(e.message);
	process.exit(1);
});
