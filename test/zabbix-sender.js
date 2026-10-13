// zabbix_sender protocol straight to the server's trapper port. Works on every
// Zabbix version (history.push only exists from 7.0), so the live suites can
// inject values on 6.x too. Resolves to the number of values processed.
const net = require('net');

function zabbixSend({ hostname, port }, host, key, value) {
	return new Promise((resolve, reject) => {
		const payload = Buffer.from(JSON.stringify({ request: 'sender data', data: [{ host, key, value: String(value) }] }));
		const header = Buffer.alloc(13);
		header.write('ZBXD\x01', 0, 'latin1');
		header.writeUInt32LE(payload.length, 5);
		// Like zabbix_sender: keep the socket open until the server has answered.
		const socket = net.connect(port, hostname, () => socket.write(Buffer.concat([header, payload])));
		let reply = Buffer.alloc(0);
		let done = false;
		const finish = () => {
			if (done) return;
			done = true;
			socket.destroy();
			resolve(Number((/processed: (\d+)/.exec(reply.subarray(13).toString()) || [])[1] || 0));
		};
		socket.setTimeout(10000, () => {
			socket.destroy();
			reject(new Error('zabbix sender: no reply from ' + hostname + ':' + port));
		});
		socket.on('data', (chunk) => {
			reply = Buffer.concat([reply, chunk]);
			if (reply.length >= 13 && reply.length >= 13 + reply.readUInt32LE(5)) finish();
		});
		socket.on('end', finish);
		socket.on('error', (e) => (done ? undefined : reject(e)));
	});
}

/** Trapper port of the server behind ZABBIX_URL (ZABBIX_SERVER_PORT, default 10151). */
function senderTarget(baseUrl) {
	return { hostname: new URL(baseUrl).hostname, port: Number(process.env.ZABBIX_SERVER_PORT || 10151) };
}

module.exports = { zabbixSend, senderTarget };
