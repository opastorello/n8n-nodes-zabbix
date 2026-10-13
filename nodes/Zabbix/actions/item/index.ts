import {
	NodeOperationError,
	type IDataObject,
	type IExecuteFunctions,
	type IHttpRequestOptions,
	type INodeExecutionData,
	type INodeProperties,
} from 'n8n-workflow';

import { asRows, localTime } from '../../helpers/eventFormat';
import { createCrudResource, tagsField } from '../../helpers/resourceFactory';
import { toIdArray, wrapZabbixResult } from '../../helpers/utils';
import { zabbixApiRequest, zabbixBaseUrl } from '../../transport';

/**
 * Plain HTTP to the Zabbix frontend (graphs are not part of the API). Kept apart
 * from the handler that reads the credential: the session cookie it needs comes
 * from a form login, which no n8n credential type can express.
 */
async function frontendRequest(ctx: IExecuteFunctions, options: IHttpRequestOptions): Promise<unknown> {
	return await ctx.helpers.httpRequest(options);
}

const resourceModule = createCrudResource({
	resource: 'item',
	displayName: 'Item',
	apiObject: 'item',
	idField: 'itemid',
	getFilters: [
		{ name: 'hostids', displayName: 'Host IDs', description: 'Return items belonging to the given hosts' },
		{ name: 'groupids', displayName: 'Group IDs', description: 'Return items belonging to hosts in the given groups' },
		{ name: 'templateids', displayName: 'Template IDs', description: 'Return items belonging to the given templates' },
	],
	selects: [
		{ name: 'Hosts', value: 'selectHosts' },
		{ name: 'Preprocessing', value: 'selectPreprocessing' },
		{ name: 'Tags', value: 'selectTags' },
		{ name: 'Triggers', value: 'selectTriggers' },
	],
	jsonWriteKeys: ['tags', 'preprocessing'],
	writeFields: [
		{
			displayName: 'Host ID',
			name: 'hostid',
			type: 'string',
			default: '',
			description: 'ID of the host or template the item belongs to (required on create)',
		},
		{
			displayName: 'Name',
			name: 'name',
			type: 'string',
			default: '',
			description: 'Name of the item (required on create)',
		},
		{
			displayName: 'Key',
			name: 'key_',
			type: 'string',
			default: '',
			placeholder: 'system.cpu.load',
			description: 'Item key (required on create)',
		},
		{
			displayName: 'Type',
			name: 'type',
			type: 'options',
			default: 0,
			description: 'Item type',
			options: [
				{ name: 'Zabbix Agent', value: 0, description: 'Passive check — the server polls the agent (needs an Agent interface)' },
				{ name: 'Zabbix Trapper', value: 2, description: 'Values are pushed to Zabbix by zabbix_sender or History Push' },
				{ name: 'Simple Check', value: 3, description: 'Agentless checks like icmpping, net.tcp.service' },
				{ name: 'Zabbix Internal', value: 5, description: 'Metrics about Zabbix itself' },
				{ name: 'Zabbix Agent (Active)', value: 7, description: 'The agent polls the server for what to collect and pushes results' },
				{ name: 'External Check', value: 10, description: 'Runs a script from the externalscripts directory on the server' },
				{ name: 'Database Monitor', value: 11, description: 'Executes an SQL query via ODBC' },
				{ name: 'IPMI Agent', value: 12, description: 'Reads sensors from an IPMI board (needs an IPMI interface)' },
				{ name: 'SSH Agent', value: 13, description: 'Runs a command over SSH' },
				{ name: 'TELNET Agent', value: 14, description: 'Runs a command over Telnet' },
				{ name: 'Calculated', value: 15, description: 'Computes a formula over other items' },
				{ name: 'JMX Agent', value: 16, description: 'Reads Java JMX counters (needs a JMX interface)' },
				{ name: 'SNMP Trap', value: 17, description: 'Receives SNMP traps via snmptrapd' },
				{ name: 'Dependent Item', value: 18, description: 'Extracts its value from another (master) item' },
				{ name: 'HTTP Agent', value: 19, description: 'Polls an HTTP/REST endpoint' },
				{ name: 'SNMP Agent', value: 20, description: 'Polls an SNMP OID (needs an SNMP interface)' },
				{ name: 'Script', value: 21, description: 'Runs a JavaScript defined on the item' },
			],
		},
		{
			displayName: 'Value Type',
			name: 'value_type',
			type: 'options',
			default: 3,
			description: 'Type of value the item stores',
			options: [
				{ name: 'Numeric (Float)', value: 0, description: 'Decimal numbers, e.g. CPU load 1.23' },
				{ name: 'Character', value: 1, description: 'Short strings up to 255 characters' },
				{ name: 'Log', value: 2, description: 'Log lines with timestamp metadata' },
				{ name: 'Numeric (Unsigned)', value: 3, description: 'Whole numbers ≥ 0, e.g. bytes, counters' },
				{ name: 'Text', value: 4, description: 'Long text values' },
			],
		},
		{
			displayName: 'Update Interval',
			name: 'delay',
			type: 'string',
			default: '',
			placeholder: '30s',
			description: 'Update interval of the item (required for most item types)',
		},
		{
			displayName: 'Interface ID',
			name: 'interfaceid',
			type: 'string',
			default: '',
			description: 'ID of the host interface used by the item (required for some types)',
		},
		{
			displayName: 'Units',
			name: 'units',
			type: 'string',
			default: '',
			description: 'Value units',
		},
		{
			displayName: 'Status',
			name: 'status',
			type: 'options',
			default: 0,
			description: 'Whether the item is enabled',
			options: [
				{ name: 'Enabled', value: 0 },
				{ name: 'Disabled', value: 1 },
			],
		},
		tagsField('item'),
		{
			displayName: 'Preprocessing (JSON)',
			name: 'preprocessing',
			type: 'json',
			default: '',
			description: 'Array of preprocessing step objects',
		},
	],
});

const showFor = (operation: string) => ({ show: { resource: ['item'], operation: [operation] } });

const historyFields: INodeProperties[] = [
	{
		displayName: 'Item IDs',
		name: 'historyItemIds',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. 23456,23457',
		description: 'Comma-separated item IDs. Items of different value types can be mixed.',
		displayOptions: showFor('getHistory'),
	},
	{
		displayName: 'Last Hours',
		name: 'historyHours',
		type: 'number',
		typeOptions: { minValue: 0 },
		default: 1,
		description: 'How far back to read, ending now. Ignored when From is set.',
		displayOptions: showFor('getHistory'),
	},
	{
		displayName: 'From',
		name: 'historyFrom',
		type: 'dateTime',
		default: '',
		description: 'Start of the window (optional; overrides Last Hours)',
		displayOptions: showFor('getHistory'),
	},
	{
		displayName: 'To',
		name: 'historyTo',
		type: 'dateTime',
		default: '',
		description: 'End of the window (optional; default now)',
		displayOptions: showFor('getHistory'),
	},
	{
		displayName: 'Use Trends After (Days)',
		name: 'trendDays',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 7,
		description:
			'For numeric items, windows longer than this read hourly trends (min/avg/max) instead of raw history',
		displayOptions: showFor('getHistory'),
	},
	{
		displayName: 'Max Values per Item',
		name: 'historyLimit',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 1000,
		description: 'Max number of values to return for each item (newest first)',
		displayOptions: showFor('getHistory'),
	},
];

const graphFields: INodeProperties[] = [
	{
		displayName:
			'Graph images come from the Zabbix frontend, not the API, so they need a credential using Username & Password (an API token cannot open a frontend session).',
		name: 'graphNotice',
		type: 'notice',
		default: '',
		displayOptions: showFor('getGraphImage'),
	},
	{
		displayName: 'Item IDs',
		name: 'graphItemIds',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. 23456,23457',
		description: 'Comma-separated item IDs to plot together',
		displayOptions: showFor('getGraphImage'),
	},
	{
		displayName: 'From',
		name: 'graphFrom',
		type: 'string',
		default: 'now-1h',
		description: 'Start, in Zabbix time syntax (now-1h, now-7d, 2026-10-13 08:00:00)',
		displayOptions: showFor('getGraphImage'),
	},
	{
		displayName: 'To',
		name: 'graphTo',
		type: 'string',
		default: 'now',
		displayOptions: showFor('getGraphImage'),
	},
	{
		displayName: 'Width',
		name: 'graphWidth',
		type: 'number',
		default: 900,
		displayOptions: showFor('getGraphImage'),
	},
	{
		displayName: 'Height',
		name: 'graphHeight',
		type: 'number',
		default: 250,
		displayOptions: showFor('getGraphImage'),
	},
	{
		displayName: 'Put Output in Field',
		name: 'binaryPropertyName',
		type: 'string',
		default: 'data',
		description: 'Name of the binary property the PNG is written to',
		displayOptions: showFor('getGraphImage'),
	},
];

const operationSelect = resourceModule.description.find((p) => p.name === 'operation') as INodeProperties;
operationSelect.options = [
	...(operationSelect.options ?? []),
	{
		name: 'Get Graph Image',
		value: 'getGraphImage',
		action: 'Get a graph image of items',
		description: 'PNG graph of one or more items, ready to attach to a chat message or ticket',
	},
	{
		name: 'Get History',
		value: 'getHistory',
		action: 'Get item history',
		description:
			"Values of one or more items over a time window — the value type is detected for you, and long windows use trends",
	},
].sort((a, b) => String(a.name).localeCompare(String(b.name)));

export const description: INodeProperties[] = [...resourceModule.description, ...historyFields, ...graphFields];

const NUMERIC = new Set(['0', '3']);

export const handlers = {
	...resourceModule.handlers,

	async getGraphImage(this: IExecuteFunctions, i: number): Promise<INodeExecutionData[]> {
		const credentials = await this.getCredentials('zabbixTokenApi');
		if (credentials.authentication !== 'password') {
			throw new NodeOperationError(this.getNode(), 'Get Graph Image needs a Username & Password credential', {
				itemIndex: i,
				description: 'Graph images come from the Zabbix frontend, which an API token cannot log in to.',
			});
		}
		const base = zabbixBaseUrl(String(credentials.url));
		const skipSslCertificateValidation = credentials.ignoreSslIssues === true;

		const login = (await frontendRequest(this, {
			method: 'POST',
			url: `${base}/index.php`,
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				name: String(credentials.username),
				password: String(credentials.password),
				autologin: '1',
				enter: 'Sign in',
			}).toString(),
			returnFullResponse: true,
			disableFollowRedirect: true,
			ignoreHttpStatusErrors: true,
			skipSslCertificateValidation,
		})) as { headers: IDataObject };
		const setCookie = ([] as string[]).concat((login.headers['set-cookie'] as string[] | string) ?? []);
		const session = setCookie.map((c) => /zbx_session=[^;]+/.exec(c)?.[0]).find(Boolean);
		if (!session) {
			throw new NodeOperationError(this.getNode(), 'Zabbix frontend login failed', {
				itemIndex: i,
				description: 'Check the username and password, and that the user may use the frontend (GUI access).',
			});
		}

		const query = new URLSearchParams({
			from: String(this.getNodeParameter('graphFrom', i, 'now-1h')),
			to: String(this.getNodeParameter('graphTo', i, 'now')),
			width: String(this.getNodeParameter('graphWidth', i, 900)),
			height: String(this.getNodeParameter('graphHeight', i, 250)),
			type: '0',
			profileIdx: 'web.item.graph.filter',
		});
		const itemids = toIdArray(this.getNodeParameter('graphItemIds', i));
		itemids.forEach((id, k) => query.append(`itemids[${k}]`, id));
		const chart = (await frontendRequest(this, {
			method: 'GET',
			url: `${base}/chart2.php?${query.toString()}`,
			headers: { Cookie: session },
			encoding: 'arraybuffer',
			returnFullResponse: true,
			skipSslCertificateValidation,
		})) as { headers: IDataObject; body: ArrayBuffer };
		if (!String(chart.headers['content-type'] ?? '').startsWith('image/')) {
			throw new NodeOperationError(this.getNode(), 'Zabbix did not return an image', {
				itemIndex: i,
				description: "The session was refused or the user can't see these items.",
			});
		}
		const property = String(this.getNodeParameter('binaryPropertyName', i, 'data'));
		const binary = await this.helpers.prepareBinaryData(
			Buffer.from(chart.body),
			`zabbix-graph-${itemids.join('-')}.png`,
			'image/png',
		);
		return [{ json: { itemids, from: query.get('from'), to: query.get('to') }, binary: { [property]: binary }, pairedItem: { item: i } }];
	},

	async getHistory(this: IExecuteFunctions, i: number): Promise<INodeExecutionData[]> {
		const itemids = toIdArray(this.getNodeParameter('historyItemIds', i));
		const now = Math.floor(Date.now() / 1000);
		const toParam = this.getNodeParameter('historyTo', i, '') as string;
		const fromParam = this.getNodeParameter('historyFrom', i, '') as string;
		const timeTill = toParam ? Math.floor(new Date(toParam).getTime() / 1000) : now;
		const timeFrom = fromParam
			? Math.floor(new Date(fromParam).getTime() / 1000)
			: timeTill - Math.round((this.getNodeParameter('historyHours', i, 1) as number) * 3600);
		const useTrends = timeTill - timeFrom > (this.getNodeParameter('trendDays', i, 7) as number) * 86400;
		const limit = this.getNodeParameter('historyLimit', i, 1000) as number;
		const timeZone = this.getTimezone();

		// history.get silently returns nothing when `history` doesn't match the
		// item's value type, so read the types first.
		const items = asRows(
			await zabbixApiRequest.call(this, 'item.get', {
				itemids,
				output: ['itemid', 'name', 'key_', 'value_type', 'units'],
				selectHosts: ['hostid', 'host', 'name'],
			}),
		);
		if (!items.length) {
			throw new NodeOperationError(this.getNode(), 'No items found for the given IDs', {
				itemIndex: i,
				description: "Check the IDs and the API user's permissions.",
			});
		}

		const out: IDataObject[] = [];
		for (const item of items) {
			const host = ((item.hosts as IDataObject[]) ?? [])[0] ?? {};
			const base = {
				itemid: item.itemid,
				item: item.name,
				key_: item.key_,
				units: item.units,
				host: host.name ?? host.host,
				hostid: host.hostid,
			};
			const trends = useTrends && NUMERIC.has(String(item.value_type));
			const rows = trends
				? asRows(
						await zabbixApiRequest.call(this, 'trend.get', {
							itemids: [item.itemid],
							time_from: timeFrom,
							time_till: timeTill,
							output: ['clock', 'num', 'value_min', 'value_avg', 'value_max'],
						}),
					)
						.sort((a, b) => Number(b.clock) - Number(a.clock))
						.slice(0, limit)
				: asRows(
						await zabbixApiRequest.call(this, 'history.get', {
							history: Number(item.value_type),
							itemids: [item.itemid],
							time_from: timeFrom,
							time_till: timeTill,
							output: 'extend',
							sortfield: 'clock',
							sortorder: 'DESC',
							limit,
						}),
					);
			for (const row of rows) {
				out.push({
					...base,
					source: trends ? 'trends' : 'history',
					clock: row.clock,
					...(Number.isFinite(Number(row.clock))
						? { time: new Date(Number(row.clock) * 1000).toISOString(), time_local: localTime(row.clock, timeZone) }
						: {}),
					...(trends
						? { value_min: row.value_min, value_avg: row.value_avg, value_max: row.value_max, num: row.num }
						: { value: row.value }),
				});
			}
		}
		return wrapZabbixResult(out, i);
	},
};
