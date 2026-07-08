import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
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
import { zabbixApiRequest } from '../../transport';

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
			name: 'Get Many',
			value: 'getAll',
			action: 'Get many hosts',
			description: 'Retrieve hosts, with optional group/template/name filters',
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

export const description: INodeProperties[] = [
	operationSelect,
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
