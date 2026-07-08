import type {
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class ZabbixTokenApi implements ICredentialType {
	name = 'zabbixTokenApi';

	displayName = 'Zabbix Token API';

	icon: Icon = { light: 'file:../icons/zabbix.svg', dark: 'file:../icons/zabbix.dark.svg' };

	documentationUrl =
		'https://www.zabbix.com/documentation/current/en/manual/web_interface/frontend_sections/users/api_tokens';

	properties: INodeProperties[] = [
		{
			displayName: 'Zabbix URL',
			name: 'url',
			type: 'string',
			default: '',
			required: true,
			placeholder: 'https://zabbix.example.com/zabbix',
			hint: 'Just the frontend base URL — do not include /api_jsonrpc.php',
			description:
				'Base URL of the Zabbix frontend (without <code>/api_jsonrpc.php</code>, which is appended automatically)',
		},
		{
			displayName: 'API Token',
			name: 'apiToken',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'API token created in Zabbix under Users → API tokens (Zabbix 5.4+). Sent as an <code>Authorization: Bearer</code> header.',
		},
	];

	// No generic `authenticate` block: the token is attached manually in the
	// node transport. This keeps n8n from injecting a "Custom API Call" operation
	// into every resource (which only appears for generic-auth credentials).

	// A lightweight authenticated `host.get` verifies both connectivity and that
	// the token is valid. (`apiinfo.version` can't be used here — Zabbix rejects
	// it when an Authorization header is present.)
	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.url.replace(new RegExp("/$"), "")}}',
			url: '/api_jsonrpc.php',
			method: 'POST',
			headers: {
				'Content-Type': 'application/json-rpc',
				Authorization: '=Bearer {{$credentials.apiToken}}',
			},
			body: {
				jsonrpc: '2.0',
				method: 'host.get',
				params: { output: ['hostid'], limit: 1 },
				id: 1,
			},
		},
		rules: [
			{
				type: 'responseSuccessBody',
				properties: {
					key: 'error.code',
					value: -32602,
					message: 'Invalid Zabbix API token or URL',
				},
			},
		],
	};
}
