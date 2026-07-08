import type { IDataObject, IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';

import { buildCommonGetParams, getCommonDescription } from '../../descriptions/getCommon.description';
import type { IZabbixResourceModule } from '../../helpers/interfaces';
import { parseJsonParameter, removeEmpty, toIdArray, wrapZabbixResult } from '../../helpers/utils';
import { zabbixApiRequest } from '../../transport';

const resource = 'script';
const showFor = (op: string | string[]) => ({
	show: { resource: [resource], operation: Array.isArray(op) ? op : [op] },
});

export const description: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: [resource] } },
		options: [
			{ name: 'Create', value: 'create', action: 'Create a script', description: 'Create a new script in Zabbix' },
			{ name: 'Delete', value: 'delete', action: 'Delete scripts', description: 'Permanently delete one or more scripts by ID' },
			{ name: 'Execute', value: 'execute', action: 'Execute a script', description: 'Run a script on a host or event (e.g. for remediation)' },
			{ name: 'Get Many', value: 'getAll', action: 'Get many scripts', description: 'Retrieve scripts, with optional filters' },
			{ name: 'Get Scripts by Events', value: 'getScriptsByEvents', action: 'Get scripts available for events', description: 'List which scripts can run on the given events' },
			{ name: 'Get Scripts by Hosts', value: 'getScriptsByHosts', action: 'Get scripts available for hosts', description: 'List which scripts can run on the given hosts' },
			{ name: 'Update', value: 'update', action: 'Update a script', description: 'Update an existing script by ID' },
		],
		default: 'getAll',
	},
	{
		displayName: 'Event IDs',
		name: 'byEventids',
		type: 'string',
		default: '',
		required: true,
		description: 'Comma-separated event IDs to return available scripts for',
		displayOptions: showFor('getScriptsByEvents'),
	},
	{
		displayName: 'Host IDs',
		name: 'byHostids',
		type: 'string',
		default: '',
		required: true,
		description: 'Comma-separated host IDs to return available scripts for',
		displayOptions: showFor('getScriptsByHosts'),
	},
	{
		displayName: 'Script ID',
		name: 'scriptid',
		type: 'string',
		default: '',
		required: true,
		description: 'ID of the script',
		displayOptions: showFor(['update', 'execute']),
	},
	{
		displayName: 'Host ID',
		name: 'hostid',
		type: 'string',
		default: '',
		description: 'Host to run the script on (required unless an Event ID is given)',
		displayOptions: showFor('execute'),
	},
	{
		displayName: 'Event ID',
		name: 'eventid',
		type: 'string',
		default: '',
		description: 'Event to run the script on (alternative to Host ID)',
		displayOptions: showFor('execute'),
	},
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		default: '',
		required: true,
		description: 'Name of the script',
		displayOptions: showFor('create'),
	},
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		default: '',
		description: 'New name of the script (leave empty to keep unchanged)',
		displayOptions: showFor('update'),
	},
	{
		displayName: 'Command',
		name: 'command',
		type: 'string',
		typeOptions: { rows: 3 },
		default: '',
		required: true,
		description: 'Command to run',
		displayOptions: showFor('create'),
	},
	{
		displayName: 'Command',
		name: 'command',
		type: 'string',
		typeOptions: { rows: 3 },
		default: '',
		description: 'New command to run (leave empty to keep unchanged)',
		displayOptions: showFor('update'),
	},
	{
		displayName: 'Additional Fields',
		name: 'fields',
		type: 'collection',
		placeholder: 'Add field',
		default: {},
		displayOptions: showFor(['create', 'update']),
		options: [
			{ displayName: 'Additional Parameters (JSON)', name: 'additionalParameters', type: 'json', default: '', description: 'Extra parameters merged into the request body' },
			{ displayName: 'Group ID', name: 'groupid', type: 'string', default: '', description: 'Host group the script is available for (0 for all)' },
			{
				displayName: 'Scope',
				name: 'scope',
				type: 'options',
				default: 1,
				description: 'Where the script can be used',
				options: [
					{ name: 'Action Operation', value: 1 },
					{ name: 'Manual Event Action', value: 4 },
					{ name: 'Manual Host Action', value: 2 },
				],
			},
			{
				displayName: 'Type',
				name: 'type',
				type: 'options',
				default: 5,
				description: 'Type of the script',
				options: [
					{ name: 'IPMI', value: 1 },
					{ name: 'Script', value: 5 },
					{ name: 'SSH', value: 2 },
					{ name: 'Telnet', value: 3 },
					{ name: 'Webhook', value: 6 },
				],
			},
		],
	},
	{
		displayName: 'Script IDs',
		name: 'scriptids',
		type: 'string',
		default: '',
		required: true,
		description: 'Comma-separated script IDs to delete',
		displayOptions: showFor('delete'),
	},
	...getCommonDescription(resource),
];

function buildBody(this: IExecuteFunctions, i: number, isUpdate: boolean): IDataObject {
	const body: IDataObject = {};
	if (isUpdate) body.scriptid = this.getNodeParameter('scriptid', i) as string;
	const name = this.getNodeParameter('name', i, '') as string;
	if (name) body.name = name;
	const command = this.getNodeParameter('command', i, '') as string;
	if (command) body.command = command;
	const fields = this.getNodeParameter('fields', i, {}) as IDataObject;
	const parsed: IDataObject = { ...fields };
	let extra: IDataObject = {};
	if (parsed.additionalParameters !== undefined && parsed.additionalParameters !== '') {
		extra = parseJsonParameter.call(this, parsed.additionalParameters, 'Additional Parameters (JSON)', i);
	}
	delete parsed.additionalParameters;
	return { ...body, ...removeEmpty(parsed), ...extra };
}

export const handlers: IZabbixResourceModule['handlers'] = {
	async create(this: IExecuteFunctions, i: number): Promise<INodeExecutionData[]> {
		const result = await zabbixApiRequest.call(this, 'script.create', buildBody.call(this, i, false));
		return wrapZabbixResult(result, i);
	},
	async update(this: IExecuteFunctions, i: number): Promise<INodeExecutionData[]> {
		const result = await zabbixApiRequest.call(this, 'script.update', buildBody.call(this, i, true));
		return wrapZabbixResult(result, i);
	},
	async getAll(this: IExecuteFunctions, i: number): Promise<INodeExecutionData[]> {
		const result = await zabbixApiRequest.call(this, 'script.get', buildCommonGetParams.call(this, i));
		return wrapZabbixResult(result, i);
	},
	async delete(this: IExecuteFunctions, i: number): Promise<INodeExecutionData[]> {
		const ids = toIdArray(this.getNodeParameter('scriptids', i));
		const result = await zabbixApiRequest.call(this, 'script.delete', ids);
		return wrapZabbixResult(result, i);
	},
	async execute(this: IExecuteFunctions, i: number): Promise<INodeExecutionData[]> {
		const params: IDataObject = { scriptid: this.getNodeParameter('scriptid', i) as string };
		const hostid = this.getNodeParameter('hostid', i, '') as string;
		const eventid = this.getNodeParameter('eventid', i, '') as string;
		if (hostid) params.hostid = hostid;
		if (eventid) params.eventid = eventid;
		const result = await zabbixApiRequest.call(this, 'script.execute', params);
		return wrapZabbixResult(result, i);
	},

	// Zabbix 7.x expects a single numeric ID per call ({ hostid: 123 }) and
	// returns a map keyed by that ID — so loop the provided IDs and merge.
	async getScriptsByEvents(this: IExecuteFunctions, i: number): Promise<INodeExecutionData[]> {
		const eventids = toIdArray(this.getNodeParameter('byEventids', i));
		const merged: IDataObject = {};
		for (const eventid of eventids) {
			const result = (await zabbixApiRequest.call(this, 'script.getscriptsbyevents', {
				eventid: Number(eventid),
			})) as IDataObject;
			Object.assign(merged, result);
		}
		return wrapZabbixResult(merged, i);
	},

	async getScriptsByHosts(this: IExecuteFunctions, i: number): Promise<INodeExecutionData[]> {
		const hostids = toIdArray(this.getNodeParameter('byHostids', i));
		const merged: IDataObject = {};
		for (const hostid of hostids) {
			const result = (await zabbixApiRequest.call(this, 'script.getscriptsbyhosts', {
				hostid: Number(hostid),
			})) as IDataObject;
			Object.assign(merged, result);
		}
		return wrapZabbixResult(merged, i);
	},
};
