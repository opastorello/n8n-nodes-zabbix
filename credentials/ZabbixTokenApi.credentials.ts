import type { Icon, ICredentialType, INodeProperties } from 'n8n-workflow';

export class ZabbixTokenApi implements ICredentialType {
	// Internal name kept from the token-only release so saved credentials keep working.
	name = 'zabbixTokenApi';

	displayName = 'Zabbix API';

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
			hint: 'The frontend base URL — /api_jsonrpc.php is appended automatically',
			description:
				'Base URL of the Zabbix frontend. <code>/api_jsonrpc.php</code> is appended automatically (and ignored if you include it).',
		},
		{
			displayName: 'Authentication',
			name: 'authentication',
			type: 'options',
			default: 'apiToken',
			options: [
				{
					name: 'API Token',
					value: 'apiToken',
					description: 'Recommended. Create one under Users → API tokens (Zabbix 5.4+).',
				},
				{
					name: 'Username & Password',
					value: 'password',
					description: 'Logs in with user.login and reuses the session until it expires',
				},
			],
		},
		{
			displayName: 'API Token',
			name: 'apiToken',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: 'API token created in Zabbix under Users → API tokens',
			displayOptions: { show: { authentication: ['apiToken'] } },
		},
		{
			displayName: 'Username',
			name: 'username',
			type: 'string',
			default: '',
			required: true,
			displayOptions: { show: { authentication: ['password'] } },
		},
		{
			displayName: 'Password',
			name: 'password',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			displayOptions: { show: { authentication: ['password'] } },
		},
		{
			displayName: 'Read-Only',
			name: 'readOnly',
			type: 'boolean',
			default: false,
			description:
				'Whether to block every method that changes Zabbix (create, update, delete, acknowledge, execute, push, …). Use it for AI-agent tools and reporting workflows.',
		},
		{
			displayName: 'Extra Headers (JSON)',
			name: 'extraHeaders',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			placeholder: '{"CF-Access-Client-Id": "…", "CF-Access-Client-Secret": "…"}',
			description:
				'Headers sent with every request — for a proxy or Cloudflare Access in front of Zabbix. JSON object.',
		},
		{
			displayName: 'Ignore SSL Issues (Insecure)',
			name: 'ignoreSslIssues',
			type: 'boolean',
			default: false,
			description:
				'Whether to connect even if the TLS certificate cannot be validated (e.g. a self-signed certificate on an internal Zabbix)',
		},
	];

	// No generic `authenticate` block: the transport attaches the token itself
	// (as a header or, before Zabbix 6.4, in the request body). The connection
	// test lives in the nodes (`testedBy`) so it shares that logic.
}
