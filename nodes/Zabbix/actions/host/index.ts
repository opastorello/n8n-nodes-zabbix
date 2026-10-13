import {
	NodeOperationError,
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeProperties,
} from 'n8n-workflow';

import type { IZabbixResourceModule } from '../../helpers/interfaces';
import { macrosField, tagsField, unwrapFixedCollection } from '../../helpers/resourceFactory';
import {
	idListToObjects,
	parseJsonParameter,
	removeEmpty,
	toIdArray,
	wrapZabbixResult,
} from '../../helpers/utils';
import { buildCommonGetParams, getCommonDescription } from '../../descriptions/getCommon.description';
import { asRows, attachHosts, enrichEvent, localTime, severityName, simplifyEvent } from '../../helpers/eventFormat';
import { zabbixApiRequest, zabbixBaseUrl } from '../../transport';

const resource = 'host';

const showFor = (operation: string) => ({ show: { resource: [resource], operation: [operation] } });

// ---------------------------------------------------------------------------
// Operation selector
// ---------------------------------------------------------------------------
const operationSelect: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: [resource] } },
	options: [
		{
			name: 'Create',
			value: 'create',
			action: 'Create a host',
			description: 'Create a new monitored host in Zabbix',
		},
		{
			name: 'Delete',
			value: 'delete',
			action: 'Delete hosts',
			description: 'Permanently delete one or more hosts by ID',
		},
		{
			name: 'Disable',
			value: 'disable',
			action: 'Disable hosts',
			description: 'Stop monitoring one or more hosts (status: unmonitored)',
		},
		{
			name: 'Enable',
			value: 'enable',
			action: 'Enable hosts',
			description: 'Resume monitoring one or more hosts (status: monitored)',
		},
		{
			name: 'Get Health Snapshot',
			value: 'getHealth',
			action: 'Get a health snapshot of hosts',
			description:
				'Interface availability, open problems, items without data, proxy health and maintenance — one result per host',
		},
		{
			name: 'Get Many',
			value: 'getAll',
			action: 'Get many hosts',
			description: 'Retrieve hosts, with optional group/template/name filters',
		},
		{
			name: 'Get Site Summary',
			value: 'getSiteSummary',
			action: 'Get a summary of a site',
			description:
				'Hosts up/down and open problems by severity for a host group or a site tag, with the oldest problems',
		},
		{
			name: 'Link Templates',
			value: 'linkTemplates',
			action: 'Link templates to hosts',
			description: 'Add templates to hosts, keeping the templates already linked',
		},
		{
			name: 'Mass Add',
			value: 'massAdd',
			action: 'Mass add to hosts',
			description: 'Add related objects (groups, templates, macros…) to multiple hosts',
		},
		{
			name: 'Mass Remove',
			value: 'massRemove',
			action: 'Mass remove from hosts',
			description: 'Remove related objects from multiple hosts',
		},
		{
			name: 'Mass Update',
			value: 'massUpdate',
			action: 'Mass update hosts',
			description: 'Replace properties on multiple hosts at once',
		},
		{
			name: 'Set Macros',
			value: 'setMacros',
			action: 'Set macros on hosts',
			description: 'Add/update, replace or remove host macros — the mode is explicit',
		},
		{
			name: 'Set Tags',
			value: 'setTags',
			action: 'Set tags on hosts',
			description: 'Add, replace or remove host tags — the mode is explicit',
		},
		{
			name: 'Unlink Templates',
			value: 'unlinkTemplates',
			action: 'Unlink templates from hosts',
			description: 'Remove templates from hosts, optionally deleting what they created',
		},
		{
			name: 'Update',
			value: 'update',
			action: 'Update a host',
			description: 'Update an existing host by ID',
		},
	],
	default: 'getAll',
};

// ---------------------------------------------------------------------------
// Shared write fields (create / update)
// ---------------------------------------------------------------------------
const writeFields: INodeProperties[] = [
	{
		displayName: 'Host ID',
		name: 'hostid',
		type: 'string',
		default: '',
		required: true,
		description: 'ID of the host to update',
		displayOptions: showFor('update'),
	},
	{
		displayName: 'Technical Name',
		name: 'host',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'web-server-01',
		description: 'Technical (unique) name of the host',
		displayOptions: showFor('create'),
	},
	{
		displayName: 'Group IDs',
		name: 'groups',
		type: 'string',
		default: '',
		required: true,
		placeholder: '2,4',
		description: 'Comma-separated host group IDs the host belongs to',
		displayOptions: showFor('create'),
	},
	{
		displayName: 'Interfaces',
		name: 'interfaces',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		placeholder: 'Add Interface',
		default: {},
		description:
			'How Zabbix reaches the host. Most hosts need one Agent interface; leave empty only for hosts monitored without interfaces (e.g. trapper-only).',
		displayOptions: showFor('create'),
		options: [
			{
				name: 'interfaceItems',
				displayName: 'Interface',
				values: [
					{
						displayName: 'Connect Via',
						name: 'useip',
						type: 'options',
						default: 1,
						description: 'Whether to connect using the IP address or the DNS name',
						options: [
							{
								name: 'IP Address',
								value: 1
							},
							{
								name: 'DNS Name',
								value: 0
							},
						]
					},
					{
						displayName: 'Default Interface',
						name: 'main',
						type: 'options',
						default: 1,
						description: 'Whether this is the default interface of its type on the host',
						options: [
							{
								name: 'Yes',
								value: 1
							},
							{
								name: 'No',
								value: 0
							},
					]
					},
					{
						displayName: 'DNS Name',
						name: 'dns',
						type: 'string',
						default: '',
						placeholder: 'host.example.com',
						description: 'DNS name of the host',
						displayOptions: { show: { useip: [0] } },
					},
					{
						displayName: 'IP Address',
						name: 'ip',
						type: 'string',
						default: '',
						placeholder: '192.168.0.10',
						description: 'IP address of the host',
						displayOptions: { show: { useip: [1] } },
					},
					{
						displayName: 'Port',
						name: 'port',
						type: 'string',
						default: '10050',
						description: 'Port to connect to (Agent 10050, SNMP 161, IPMI 623, JMX 12345)',
					},
					{
						displayName: 'SNMP Details (JSON)',
						name: 'details',
						type: 'json',
						default: '{"version": 2, "community": "{$SNMP_COMMUNITY}"}',
						description: 'SNMP-specific settings (version, community, security…)',
						displayOptions: { show: { type: [2] } },
					},
					{
						displayName: 'Type',
						name: 'type',
						type: 'options',
						default: 1,
						description: 'Interface type',
						options: [
							{
								name: 'Agent',
								value: 1,
								description: 'Zabbix agent (default port 10050)',
							},
							{
								name: 'SNMP',
								value: 2,
								description: 'SNMP device (default port 161)',
							},
							{
								name: 'IPMI',
								value: 3,
								description: 'IPMI management board (default port 623)',
							},
							{
								name: 'JMX',
								value: 4,
								description: 'Java application via JMX (default port 12345)',
							},
					]
					},
			],
			},
		],
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add field',
		default: {},
		displayOptions: { show: { resource: [resource], operation: ['create', 'update'] } },
		options: [
			{
				displayName: 'Description',
				name: 'description',
				type: 'string',
				typeOptions: { rows: 3 },
				default: '',
				description: 'Description of the host',
			},
			{
				displayName: 'Group IDs',
				name: 'groups',
				type: 'string',
				default: '',
				placeholder: '2,4',
				description: 'Comma-separated host group IDs (replaces the current groups on update)',
			},
			{
				displayName: 'Interfaces (JSON)',
				name: 'interfaces',
				type: 'json',
				default: '',
				description: 'Array of interface objects (replaces the current interfaces on update)',
			},
			{
				displayName: 'Inventory (JSON)',
				name: 'inventory',
				type: 'json',
				default: '',
				description: 'Host inventory properties as a JSON object',
			},
			{
				displayName: 'Inventory Mode',
				name: 'inventory_mode',
				type: 'options',
				options: [
					{ name: 'Disabled', value: -1 },
					{ name: 'Manual', value: 0 },
					{ name: 'Automatic', value: 1 },
				],
				default: 0,
				description: 'Host inventory population mode',
			},
			macrosField('host'),
			{
				displayName: 'Proxy ID',
				name: 'proxyid',
				type: 'string',
				default: '',
				description: 'ID of the proxy that monitors the host',
			},
			{
				displayName: 'Status',
				name: 'status',
				type: 'options',
				options: [
					{ name: 'Monitored', value: 0 },
					{ name: 'Unmonitored', value: 1 },
				],
				default: 0,
				description: 'Whether the host is monitored',
			},
			tagsField('host'),
			{
				displayName: 'Template IDs',
				name: 'templates',
				type: 'string',
				default: '',
				placeholder: '10001,10002',
				description: 'Comma-separated template IDs to link (replaces linked templates on update)',
			},
			{
				displayName: 'Visible Name',
				name: 'name',
				type: 'string',
				default: '',
				description: 'Visible name of the host (defaults to the technical name)',
			},
		],
	},
];

// ---------------------------------------------------------------------------
// Get fields
// ---------------------------------------------------------------------------
const getFields: INodeProperties[] = [
	{
		displayName: 'Host Names or IDs',
		name: 'hostids',
		type: 'multiOptions',
		typeOptions: { loadOptionsMethod: 'getHosts' },
		default: [],
		description: 'Return only these hosts (leave empty for all). Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: showFor('getAll'),
	},
	{
		displayName: 'Host Group Names or IDs',
		name: 'groupids',
		type: 'multiOptions',
		typeOptions: { loadOptionsMethod: 'getHostGroups' },
		default: [],
		description: 'Return only hosts in these host groups (leave empty for all). Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: showFor('getAll'),
	},
	{
		displayName: 'Template Names or IDs',
		name: 'templateids',
		type: 'multiOptions',
		typeOptions: { loadOptionsMethod: 'getTemplates' },
		default: [],
		description: 'Return only hosts linked to these templates (leave empty for all). Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: showFor('getAll'),
	},
	{
		displayName: 'Select Related',
		name: 'selects',
		type: 'multiOptions',
		default: [],
		description: 'Related objects to include with each host',
		displayOptions: showFor('getAll'),
		options: [
			{ name: 'Groups', value: 'selectHostGroups' },
			{ name: 'Interfaces', value: 'selectInterfaces' },
			{ name: 'Inventory', value: 'selectInventory' },
			{ name: 'Items', value: 'selectItems' },
			{ name: 'Macros', value: 'selectMacros' },
			{ name: 'Tags', value: 'selectTags' },
			{ name: 'Templates', value: 'selectParentTemplates' },
			{ name: 'Triggers', value: 'selectTriggers' },
		],
	},
	...getCommonDescription(resource),
];

// ---------------------------------------------------------------------------
// Delete + mass fields
// ---------------------------------------------------------------------------
const deleteFields: INodeProperties[] = [
	{
		displayName:
			'This permanently deletes the selected hosts from Zabbix, including their items and history. This cannot be undone — run Get Many first if you are unsure of the IDs.',
		name: 'deleteNotice',
		type: 'notice',
		default: '',
		displayOptions: showFor('delete'),
	},
	{
		displayName: 'Host IDs',
		name: 'hostids',
		type: 'string',
		default: '',
		required: true,
		placeholder: '10084,10085',
		description: 'Comma-separated host IDs to delete',
		displayOptions: showFor('delete'),
	},
];

const massFields: INodeProperties[] = [
	{
		displayName: 'Host IDs',
		name: 'massHostids',
		type: 'string',
		default: '',
		required: true,
		description: 'Comma-separated host IDs to apply the operation to',
		displayOptions: {
			show: { resource: [resource], operation: ['massAdd', 'massRemove', 'massUpdate'] },
		},
	},
	{
		displayName: 'Payload (JSON)',
		name: 'massPayload',
		type: 'json',
		default: '{}',
		description:
			'Extra parameters merged into the request, e.g. <code>{"groups":[{"groupid":"5"}]}</code> for mass add/update, or <code>{"groupids":["5"]}</code> for mass remove',
		displayOptions: {
			show: { resource: [resource], operation: ['massAdd', 'massRemove', 'massUpdate'] },
		},
	},
];

const HOST_LIST_OPS = ['disable', 'enable', 'getHealth', 'linkTemplates', 'setMacros', 'setTags', 'unlinkTemplates'];
const DRY_RUN_OPS = ['disable', 'enable', 'linkTemplates', 'setMacros', 'setTags', 'unlinkTemplates'];

const bulkFields: INodeProperties[] = [
	{
		displayName:
			'Templates, Group IDs, Tags and Macros set here REPLACE the host\'s current list — anything not listed is removed (unlinking a template disables its items and triggers). To add without removing, use "Link Templates" or "Mass Add".',
		name: 'updateReplaceNotice',
		type: 'notice',
		default: '',
		displayOptions: showFor('update'),
	},
	{
		displayName: 'Host Names or IDs',
		name: 'targetHostids',
		type: 'multiOptions',
		typeOptions: { loadOptionsMethod: 'getHosts' },
		default: [],
		required: true,
		description:
			'Hosts to act on (interface IP addresses work too). Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: { show: { resource: [resource], operation: HOST_LIST_OPS } },
	},
	{
		displayName: 'Dry Run',
		name: 'dryRun',
		type: 'boolean',
		default: false,
		description: 'Whether to only report what would change (before/after per host) without changing Zabbix',
		displayOptions: { show: { resource: [resource], operation: DRY_RUN_OPS } },
	},
	{
		displayName: 'Mode',
		name: 'tagMode',
		type: 'options',
		default: 'merge',
		options: [
			{ name: 'Merge (Add)', value: 'merge', description: 'Add these tags; keep every existing tag' },
			{ name: 'Remove', value: 'remove', description: 'Remove these tags (a tag with an empty value removes every value of it)' },
			{ name: 'Replace All', value: 'replace', description: 'The host ends up with exactly these tags' },
		],
		displayOptions: showFor('setTags'),
	},
	{ ...tagsField('host'), name: 'hostTags', displayOptions: showFor('setTags') },
	{
		displayName: 'Mode',
		name: 'macroMode',
		type: 'options',
		default: 'merge',
		options: [
			{ name: 'Merge (Add or Update)', value: 'merge', description: 'Create missing macros, update the value of existing ones; keep the rest' },
			{ name: 'Remove', value: 'remove', description: 'Delete these macros (value is ignored)' },
			{ name: 'Replace All', value: 'replace', description: 'The host ends up with exactly these macros — secret macros not listed are lost' },
		],
		displayOptions: showFor('setMacros'),
	},
	{ ...macrosField('host'), name: 'hostMacros', displayOptions: showFor('setMacros') },
	{
		displayName: 'Host Group Names or IDs',
		name: 'summaryGroupIds',
		type: 'multiOptions',
		typeOptions: { loadOptionsMethod: 'getHostGroups' },
		default: [],
		description:
			'Hosts of these groups make up the site. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: showFor('getSiteSummary'),
	},
	{
		displayName: 'Site Tag',
		name: 'summaryTag',
		type: 'string',
		default: '',
		placeholder: 'e.g. site',
		description: 'Or select hosts by a host tag (combined with the groups if both are set)',
		displayOptions: showFor('getSiteSummary'),
	},
	{
		displayName: 'Site Tag Value',
		name: 'summaryTagValue',
		type: 'string',
		default: '',
		placeholder: 'e.g. XDRJ',
		description: 'Value of the site tag (leave empty for any value)',
		displayOptions: showFor('getSiteSummary'),
	},
	{
		displayName: 'Template Names or IDs',
		name: 'templateIds',
		type: 'multiOptions',
		typeOptions: { loadOptionsMethod: 'getTemplates' },
		default: [],
		required: true,
		description:
			'Templates to link or unlink. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: { show: { resource: [resource], operation: ['linkTemplates', 'unlinkTemplates'] } },
	},
	{
		displayName: 'Stale After (Minutes)',
		name: 'staleMinutes',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 60,
		description:
			'An enabled item counts as "no data" when its last value is older than this (trapper items are ignored)',
		displayOptions: showFor('getHealth'),
	},
	{
		displayName: 'Clear Items and Triggers',
		name: 'clearTemplateData',
		type: 'boolean',
		default: false,
		description:
			'Whether to also delete the items, triggers and graphs the templates created on the hosts. Off: they stay on the host, no longer linked to the template.',
		displayOptions: showFor('unlinkTemplates'),
	},
];

export const description: INodeProperties[] = [
	operationSelect,
	...bulkFields,
	...writeFields,
	...getFields,
	...deleteFields,
	...massFields,
];

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------
function buildWriteBody(this: IExecuteFunctions, i: number, isUpdate: boolean): IDataObject {
	const body: IDataObject = {};

	if (isUpdate) {
		body.hostid = this.getNodeParameter('hostid', i) as string;
	} else {
		body.host = this.getNodeParameter('host', i) as string;
		body.groups = idListToObjects(this.getNodeParameter('groups', i), 'groupid');

		// Interfaces arrive as a fixedCollection ({ interfaceItems: [...] }).
		// Zabbix requires both `ip` and `dns` keys on every interface (empty
		// string for the unused one) and `details` only for SNMP.
		const rawInterfaces = this.getNodeParameter('interfaces', i, {}) as IDataObject;
		const items = unwrapFixedCollection(rawInterfaces, 'interfaceItems');
		if (Array.isArray(items) && items.length > 0) {
			body.interfaces = (items as IDataObject[]).map((iface) => {
				const normalized: IDataObject = {
					type: iface.type ?? 1,
					main: iface.main ?? 1,
					useip: iface.useip ?? 1,
					ip: (iface.ip as string) ?? '',
					dns: (iface.dns as string) ?? '',
					port: (iface.port as string) || '10050',
				};
				if (normalized.type === 2 && iface.details !== undefined && iface.details !== '') {
					normalized.details = parseJsonParameter.call(this, iface.details, 'SNMP Details (JSON)', i);
				}
				return normalized;
			});
		}
	}

	const extra = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
	const merged: IDataObject = { ...extra };

	if (merged.groups) merged.groups = idListToObjects(merged.groups, 'groupid');
	if (merged.templates) merged.templates = idListToObjects(merged.templates, 'templateid');
	// Tags/macros arrive as fixedCollections — unwrap and drop if empty.
	for (const [key, inner] of [
		['tags', 'tagItems'],
		['macros', 'macroItems'],
	] as const) {
		if (merged[key] === undefined) continue;
		merged[key] = unwrapFixedCollection(merged[key], inner) as IDataObject[] | IDataObject;
		if (
			(Array.isArray(merged[key]) && (merged[key] as unknown[]).length === 0) ||
			(typeof merged[key] === 'object' && !Array.isArray(merged[key]) && Object.keys(merged[key] as IDataObject).length === 0)
		) {
			delete merged[key];
		}
	}
	for (const jsonKey of ['interfaces', 'inventory', 'macros', 'tags']) {
		if (merged[jsonKey] !== undefined && merged[jsonKey] !== '') {
			merged[jsonKey] = parseJsonParameter.call(this, merged[jsonKey], jsonKey, i);
		}
	}

	return { ...body, ...removeEmpty(merged) };
}

export const handlers: IZabbixResourceModule['handlers'] = {
	async create(this: IExecuteFunctions, i: number): Promise<INodeExecutionData[]> {
		const result = await zabbixApiRequest.call(this, 'host.create', buildWriteBody.call(this, i, false));
		return wrapZabbixResult(result, i);
	},

	async update(this: IExecuteFunctions, i: number): Promise<INodeExecutionData[]> {
		const result = await zabbixApiRequest.call(this, 'host.update', buildWriteBody.call(this, i, true));
		return wrapZabbixResult(result, i);
	},

	async getAll(this: IExecuteFunctions, i: number): Promise<INodeExecutionData[]> {
		const params = buildCommonGetParams.call(this, i);

		// A host's visible name is often empty (it falls back to the technical
		// name), so the "Name Contains" search must cover both fields.
		if (params.search && (params.search as IDataObject).name) {
			const term = (params.search as IDataObject).name;
			params.search = { name: term, host: term };
			params.searchByAny = true;
		}

		const hostids = toIdArray(this.getNodeParameter('hostids', i, ''));
		if (hostids.length) params.hostids = hostids;
		const groupids = toIdArray(this.getNodeParameter('groupids', i, ''));
		if (groupids.length) params.groupids = groupids;
		const templateids = toIdArray(this.getNodeParameter('templateids', i, ''));
		if (templateids.length) params.templateids = templateids;

		const selects = this.getNodeParameter('selects', i, []) as string[];
		for (const select of selects) params[select] = 'extend';

		const result = await zabbixApiRequest.call(this, 'host.get', params);
		return wrapZabbixResult(result, i);
	},

	async delete(this: IExecuteFunctions, i: number): Promise<INodeExecutionData[]> {
		const hostids = toIdArray(this.getNodeParameter('hostids', i));
		const result = await zabbixApiRequest.call(this, 'host.delete', hostids);
		return wrapZabbixResult(result, i);
	},

	async massAdd(this: IExecuteFunctions, i: number): Promise<INodeExecutionData[]> {
		return massOperation.call(this, i, 'host.massadd', 'hosts');
	},

	async getHealth(this: IExecuteFunctions, i: number): Promise<INodeExecutionData[]> {
		const staleSeconds = (this.getNodeParameter('staleMinutes', i, 60) as number) * 60;
		const snapshots: IDataObject[] = [];
		for (const hostid of await targetHosts.call(this, i)) {
			snapshots.push(await hostHealth.call(this, hostid, staleSeconds));
		}
		return wrapZabbixResult(snapshots, i);
	},

	async enable(this: IExecuteFunctions, i: number): Promise<INodeExecutionData[]> {
		return setStatus.call(this, i, 0);
	},

	async disable(this: IExecuteFunctions, i: number): Promise<INodeExecutionData[]> {
		return setStatus.call(this, i, 1);
	},

	async linkTemplates(this: IExecuteFunctions, i: number): Promise<INodeExecutionData[]> {
		const hostids = await targetHosts.call(this, i);
		const templateids = toIdArray(this.getNodeParameter('templateIds', i));
		if (isDryRun.call(this, i)) {
			return wrapZabbixResult(
				(await linkedTemplates.call(this, hostids)).map(({ hostid, name, templates }) => ({
					dry_run: true,
					hostid,
					name,
					before: templates,
					after: [...new Set([...templates, ...templateids])],
				})),
				i,
			);
		}
		// host.massadd only adds; host.update with `templates` would replace the list.
		const result = await zabbixApiRequest.call(this, 'host.massadd', {
			hosts: hostids.map((hostid) => ({ hostid })),
			templates: templateids.map((templateid) => ({ templateid })),
		});
		return wrapZabbixResult(result, i);
	},

	async unlinkTemplates(this: IExecuteFunctions, i: number): Promise<INodeExecutionData[]> {
		const hostids = await targetHosts.call(this, i);
		const templateids = toIdArray(this.getNodeParameter('templateIds', i));
		const clear = this.getNodeParameter('clearTemplateData', i, false) as boolean;
		if (isDryRun.call(this, i)) {
			return wrapZabbixResult(
				(await linkedTemplates.call(this, hostids)).map(({ hostid, name, templates }) => ({
					dry_run: true,
					hostid,
					name,
					before: templates,
					after: templates.filter((id) => !templateids.includes(id)),
					clears_items_and_triggers: clear,
				})),
				i,
			);
		}
		const result = await zabbixApiRequest.call(this, 'host.massremove', {
			hostids,
			[clear ? 'templateids_clear' : 'templateids']: templateids,
		});
		return wrapZabbixResult(result, i);
	},

	async setTags(this: IExecuteFunctions, i: number): Promise<INodeExecutionData[]> {
		const mode = this.getNodeParameter('tagMode', i, 'merge') as string;
		const given = (unwrapFixedCollection(this.getNodeParameter('hostTags', i, {}), 'tagItems') ?? []) as IDataObject[];
		const wanted = (Array.isArray(given) ? given : []).map((t) => ({ tag: String(t.tag ?? ''), value: String(t.value ?? '') })).filter((t) => t.tag);
		const hosts = asRows(
			await zabbixApiRequest.call(this, 'host.get', {
				hostids: await targetHosts.call(this, i),
				output: ['hostid', 'name'],
				selectTags: ['tag', 'value', 'automatic'],
			}),
		);
		const key = (t: IDataObject) => `${String(t.tag)}\u0000${String(t.value)}`;
		const results: IDataObject[] = [];
		for (const host of hosts) {
			// Tags added by discovery (automatic) can't be set through host.update.
			const current = ((host.tags as IDataObject[]) ?? [])
				.filter((t) => String(t.automatic ?? '0') !== '1')
				.map((t) => ({ tag: String(t.tag), value: String(t.value) }));
			let next: IDataObject[];
			if (mode === 'replace') next = wanted;
			else if (mode === 'remove')
				next = current.filter((t) => !wanted.some((w) => w.tag === t.tag && (w.value === '' || w.value === t.value)));
			else next = [...current, ...wanted.filter((w) => !current.some((t) => key(t) === key(w)))];
			if (isDryRun.call(this, i)) {
				results.push({ dry_run: true, hostid: host.hostid, name: host.name, before: current, after: next });
				continue;
			}
			await zabbixApiRequest.call(this, 'host.update', { hostid: host.hostid, tags: next });
			results.push({ hostid: host.hostid, name: host.name, tags: next });
		}
		return wrapZabbixResult(results, i);
	},

	async setMacros(this: IExecuteFunctions, i: number): Promise<INodeExecutionData[]> {
		const mode = this.getNodeParameter('macroMode', i, 'merge') as string;
		const given = (unwrapFixedCollection(this.getNodeParameter('hostMacros', i, {}), 'macroItems') ?? []) as IDataObject[];
		const wanted = (Array.isArray(given) ? given : [])
			.map((m) => ({ macro: String(m.macro ?? '').trim(), value: String(m.value ?? '') }))
			.filter((m) => m.macro);
		const hostids = await targetHosts.call(this, i);
		const existing = asRows(
			await zabbixApiRequest.call(this, 'usermacro.get', { hostids, output: ['hostmacroid', 'hostid', 'macro', 'type'] }),
		);
		const dryRun = isDryRun.call(this, i);
		const results: IDataObject[] = [];
		for (const hostid of hostids) {
			const mine = existing.filter((m) => String(m.hostid) === hostid);
			const find = (macro: string) => mine.find((m) => String(m.macro) === macro);
			const plan: IDataObject[] = [];
			if (mode === 'replace') {
				plan.push({ action: 'replace', macros: wanted.map((m) => m.macro), removed: mine.map((m) => m.macro).filter((m) => !wanted.some((w) => w.macro === m)) });
				if (!dryRun) await zabbixApiRequest.call(this, 'host.update', { hostid, macros: wanted });
			} else if (mode === 'remove') {
				const ids = wanted.map((w) => find(w.macro)).filter((m): m is IDataObject => !!m);
				plan.push({ action: 'remove', macros: ids.map((m) => m.macro) });
				if (!dryRun && ids.length) await zabbixApiRequest.call(this, 'usermacro.delete', ids.map((m) => m.hostmacroid));
			} else {
				for (const w of wanted) {
					const found = find(w.macro);
					plan.push({ action: found ? 'update' : 'create', macro: w.macro });
					if (dryRun) continue;
					if (found) await zabbixApiRequest.call(this, 'usermacro.update', { hostmacroid: found.hostmacroid, value: w.value });
					else await zabbixApiRequest.call(this, 'usermacro.create', { hostid, macro: w.macro, value: w.value });
				}
			}
			results.push({ ...(dryRun ? { dry_run: true } : {}), hostid, changes: plan });
		}
		return wrapZabbixResult(results, i);
	},

	async getSiteSummary(this: IExecuteFunctions, i: number): Promise<INodeExecutionData[]> {
		const groupids = toIdArray(this.getNodeParameter('summaryGroupIds', i, []));
		const tag = String(this.getNodeParameter('summaryTag', i, '')).trim();
		const tagValue = String(this.getNodeParameter('summaryTagValue', i, '')).trim();
		if (!groupids.length && !tag) {
			throw new NodeOperationError(this.getNode(), 'Choose at least one host group or a site tag', { itemIndex: i });
		}
		const query: IDataObject = {
			output: ['hostid', 'host', 'name', 'status', 'maintenance_status'],
			selectInterfaces: ['available'],
		};
		if (groupids.length) query.groupids = groupids;
		if (tag) query.tags = [{ tag, value: tagValue, operator: tagValue ? 1 : 4 }];
		const hosts = asRows(await zabbixApiRequest.call(this, 'host.get', query));

		const counts = { total: hosts.length, up: 0, down: 0, unknown: 0, disabled: 0, in_maintenance: 0 };
		const down: IDataObject[] = [];
		for (const host of hosts) {
			if (String(host.status) === '1') {
				counts.disabled++;
				continue;
			}
			if (String(host.maintenance_status) === '1') counts.in_maintenance++;
			const states = ((host.interfaces as IDataObject[]) ?? []).map((iface) => String(iface.available));
			if (states.includes('2')) {
				counts.down++;
				down.push({ hostid: host.hostid, name: host.name ?? host.host });
			} else if (states.includes('1')) counts.up++;
			else counts.unknown++;
		}

		const hostids = hosts.map((h) => h.hostid);
		const problems = hostids.length
			? asRows(
					await zabbixApiRequest.call(this, 'problem.get', {
						hostids,
						output: ['eventid', 'objectid', 'source', 'object', 'name', 'severity', 'clock', 'r_clock', 'acknowledged', 'suppressed'],
					}),
				)
			: [];
		await attachHosts.call(this, problems);
		const baseUrl = zabbixBaseUrl(String((await this.getCredentials('zabbixTokenApi')).url));
		const bySeverity: IDataObject = {};
		for (const p of problems) {
			const name = severityName(p.severity);
			bySeverity[name] = Number(bySeverity[name] ?? 0) + 1;
		}
		const oldest = [...problems]
			.sort((a, b) => Number(a.clock) - Number(b.clock))
			.slice(0, 5)
			.map((p) => simplifyEvent(enrichEvent(p, baseUrl, this.getTimezone())));

		return wrapZabbixResult(
			{
				site: tag ? `${tag}${tagValue ? `=${tagValue}` : ''}` : groupids.join(','),
				hosts: counts,
				hosts_down: down.slice(0, 20),
				problems: { total: problems.length, by_severity: bySeverity, unacknowledged: problems.filter((p) => String(p.acknowledged) === '0').length, oldest },
			},
			i,
		);
	},

	async massUpdate(this: IExecuteFunctions, i: number): Promise<INodeExecutionData[]> {
		return massOperation.call(this, i, 'host.massupdate', 'hosts');
	},

	async massRemove(this: IExecuteFunctions, i: number): Promise<INodeExecutionData[]> {
		const hostids = toIdArray(this.getNodeParameter('massHostids', i));
		const payload = parseJsonParameter.call(
			this,
			this.getNodeParameter('massPayload', i, {}),
			'Payload (JSON)',
			i,
		);
		const result = await zabbixApiRequest.call(this, 'host.massremove', { hostids, ...payload });
		return wrapZabbixResult(result, i);
	},
};

const AVAILABILITY = ['unknown', 'available', 'unavailable'];

async function hostHealth(this: IExecuteFunctions, hostid: string, staleSeconds: number): Promise<IDataObject> {
	const now = Math.floor(Date.now() / 1000);
	const baseUrl = zabbixBaseUrl(String((await this.getCredentials('zabbixTokenApi')).url));
	const timeZone = this.getTimezone();

	const [host] = asRows(await zabbixApiRequest.call(this, 'host.get', {
		hostids: [hostid],
		output: 'extend',
		selectInterfaces: ['type', 'ip', 'dns', 'port', 'available', 'error'],
		selectHostGroups: ['groupid', 'name'],
	}));
	if (!host) return { hostid, found: false, error: `No host ${hostid} — check the ID and the API user's permissions` };

	const interfaces = ((host.interfaces as IDataObject[]) ?? []).map((iface) => ({
		...iface,
		available_name: AVAILABILITY[Number(iface.available)] ?? String(iface.available),
	}));
	const states = new Set(interfaces.map((iface) => iface.available_name));
	const availability =
		states.size === 0 ? 'no interfaces' : states.size === 1 ? [...states][0] : 'partial';

	const problems = asRows(await zabbixApiRequest.call(this, 'problem.get', {
		hostids: [hostid],
		output: ['eventid', 'objectid', 'source', 'object', 'name', 'severity', 'clock', 'r_clock', 'acknowledged', 'suppressed'],
		selectTags: 'extend',
	}));
	const bySeverity: IDataObject = {};
	for (const p of problems) {
		const name = severityName(p.severity);
		bySeverity[name] = Number(bySeverity[name] ?? 0) + 1;
	}
	const oldest = [...problems]
		.sort((a, b) => Number(a.clock) - Number(b.clock))
		.slice(0, 5)
		.map((p) => simplifyEvent(enrichEvent({ ...p, hosts: [host] }, baseUrl, timeZone)));

	const items = asRows(await zabbixApiRequest.call(this, 'item.get', {
		hostids: [hostid],
		monitored: true,
		output: ['itemid', 'name', 'key_', 'type', 'lastclock', 'state', 'error'],
	}));
	const unsupported = items.filter((item) => String(item.state) === '1');
	const stale = items.filter(
		(item) =>
			String(item.type) !== '2' &&
			String(item.state) !== '1' &&
			(Number(item.lastclock ?? 0) === 0 || now - Number(item.lastclock) > staleSeconds),
	);

	const proxyid = String(host.proxyid ?? host.proxy_hostid ?? '0');
	let proxy: IDataObject | null = null;
	if (proxyid !== '0' && proxyid !== '') {
		const [p] = asRows(await zabbixApiRequest.call(this, 'proxy.get', {
			proxyids: [proxyid],
			output: 'extend',
		}));
		if (p) {
			const lastSeen = Number(p.lastaccess ?? 0);
			proxy = {
				proxyid,
				name: p.name ?? p.host,
				version: p.version,
				last_seen_seconds_ago: lastSeen ? now - lastSeen : null,
				healthy: lastSeen > 0 && now - lastSeen < 300,
			};
		}
	}

	return {
		hostid,
		found: true,
		host: host.host,
		name: host.name,
		enabled: String(host.status) === '0',
		in_maintenance: String(host.maintenance_status) === '1',
		groups: host.hostgroups,
		availability,
		interfaces,
		problems: { total: problems.length, by_severity: bySeverity, oldest },
		items: {
			monitored: items.length,
			unsupported: unsupported.length,
			no_data: stale.length,
			unsupported_examples: unsupported.slice(0, 10).map((item) => ({ name: item.name, key_: item.key_, error: item.error })),
			no_data_examples: stale.slice(0, 10).map((item) => ({
				name: item.name,
				key_: item.key_,
				last_value_at: Number(item.lastclock) ? localTime(item.lastclock, timeZone) : 'never',
			})),
		},
		proxy,
		url: `${baseUrl}/zabbix.php?action=latest.view&filter_set=1&hostids%5B%5D=${hostid}`,
	};
}

const IP_ADDRESS = /^(\d{1,3}(\.\d{1,3}){3}|[0-9a-f]*:[0-9a-f:.]+)$/i;

/** Host IDs from the "Host Names or IDs" field; interface IP addresses are resolved to their hosts. */
async function targetHosts(this: IExecuteFunctions, i: number): Promise<string[]> {
	const values = toIdArray(this.getNodeParameter('targetHostids', i));
	const ips = values.filter((v) => IP_ADDRESS.test(v));
	if (!ips.length) return values;
	const interfaces = asRows(
		await zabbixApiRequest.call(this, 'hostinterface.get', { filter: { ip: ips }, output: ['hostid', 'ip'] }),
	);
	const missing = ips.filter((ip) => !interfaces.some((iface) => iface.ip === ip));
	if (missing.length) {
		throw new NodeOperationError(this.getNode(), `No host has an interface with IP ${missing.join(', ')}`, {
			itemIndex: i,
		});
	}
	const ids = [...values.filter((v) => !IP_ADDRESS.test(v)), ...interfaces.map((iface) => String(iface.hostid))];
	return [...new Set(ids)];
}

function isDryRun(this: IExecuteFunctions, i: number): boolean {
	return this.getNodeParameter('dryRun', i, false) as boolean;
}

async function linkedTemplates(
	this: IExecuteFunctions,
	hostids: string[],
): Promise<Array<{ hostid: string; name: string; templates: string[] }>> {
	const hosts = asRows(
		await zabbixApiRequest.call(this, 'host.get', {
			hostids,
			output: ['hostid', 'name'],
			selectParentTemplates: ['templateid'],
		}),
	);
	return hosts.map((h) => ({
		hostid: String(h.hostid),
		name: String(h.name),
		templates: ((h.parentTemplates as IDataObject[]) ?? []).map((t) => String(t.templateid)),
	}));
}

async function setStatus(this: IExecuteFunctions, i: number, status: 0 | 1): Promise<INodeExecutionData[]> {
	const hostids = await targetHosts.call(this, i);
	if (isDryRun.call(this, i)) {
		const hosts = asRows(await zabbixApiRequest.call(this, 'host.get', { hostids, output: ['hostid', 'name', 'status'] }));
		return wrapZabbixResult(
			hosts.map((h) => ({
				dry_run: true,
				hostid: h.hostid,
				name: h.name,
				before: String(h.status) === '0' ? 'enabled' : 'disabled',
				after: status === 0 ? 'enabled' : 'disabled',
				changes: String(h.status) !== String(status),
			})),
			i,
		);
	}
	const result = await zabbixApiRequest.call(
		this,
		'host.update',
		hostids.map((hostid) => ({ hostid, status })),
	);
	return wrapZabbixResult(result, i);
}

async function massOperation(
	this: IExecuteFunctions,
	i: number,
	method: string,
	hostKey: string,
): Promise<INodeExecutionData[]> {
	const hosts = idListToObjects(this.getNodeParameter('massHostids', i), 'hostid');
	const payload = parseJsonParameter.call(
		this,
		this.getNodeParameter('massPayload', i, {}),
		'Payload (JSON)',
		i,
	);
	const result = await zabbixApiRequest.call(this, method, { [hostKey]: hosts, ...payload });
	return wrapZabbixResult(result, i);
}
