import type { IDataObject, IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';

import { buildCommonGetParams, getCommonDescription } from '../../descriptions/getCommon.description';
import type { IZabbixResourceModule } from '../../helpers/interfaces';
import { toIdArray, wrapZabbixResult } from '../../helpers/utils';
import { zabbixApiRequest } from '../../transport';

const resource = 'event';
const showFor = (operation: string) => ({ show: { resource: [resource], operation: [operation] } });

const getFilters = [
	{ name: 'groupids', displayName: 'Group IDs', description: 'Return events for the given host groups' },
	{ name: 'hostids', displayName: 'Host IDs', description: 'Return events for the given hosts' },
	{ name: 'objectids', displayName: 'Object IDs', description: 'Return events for the given objects (e.g. trigger IDs)' },
];

export const description: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: [resource] } },
		options: [
			{
				name: 'Acknowledge',
				value: 'acknowledge',
				action: 'Acknowledge events',
				description: 'Acknowledge, close, comment on or change the severity of events',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many events',
				description: 'Retrieve events, with optional group/host filters',
			},
		],
		default: 'getAll',
	},
	{
		displayName: 'Event IDs',
		name: 'eventids',
		type: 'string',
		default: '',
		description: 'Comma-separated event IDs to return (leave empty for all)',
		displayOptions: showFor('getAll'),
	},
	{
		displayName: 'Host Group Names or IDs',
		name: 'groupids',
		type: 'multiOptions',
		typeOptions: { loadOptionsMethod: 'getHostGroups' },
		default: [],
		description: 'Return events for these host groups (leave empty for all). Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: showFor('getAll'),
	},
	{
		displayName: 'Host Names or IDs',
		name: 'hostids',
		type: 'multiOptions',
		typeOptions: { loadOptionsMethod: 'getHosts' },
		default: [],
		description: 'Return events for these hosts (leave empty for all). Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: showFor('getAll'),
	},
	{
		displayName: 'Object IDs',
		name: 'objectids',
		type: 'string',
		default: '',
		description: 'Return events for these objects, e.g. trigger IDs (leave empty for all)',
		displayOptions: showFor('getAll'),
	},
	{
		displayName: 'Select Related',
		name: 'selects',
		type: 'multiOptions',
		default: [],
		description: 'Related objects to include with each event',
		options: [
			{ name: 'Acknowledges', value: 'selectAcknowledges' },
			{ name: 'Hosts', value: 'selectHosts' },
			{ name: 'Tags', value: 'selectTags' },
		],
		displayOptions: showFor('getAll'),
	},
	...getCommonDescription(resource),
	{
		displayName: 'Event IDs',
		name: 'ackEventids',
		type: 'string',
		default: '',
		required: true,
		description: 'Comma-separated event IDs to acknowledge',
		displayOptions: showFor('acknowledge'),
	},
	{
		displayName: 'Actions',
		name: 'action',
		type: 'multiOptions',
		default: [],
		description: 'Actions to perform on the events (bit flags are summed automatically)',
		options: [
			{ name: 'Close Problem', value: 1 },
			{ name: 'Acknowledge', value: 2 },
			{ name: 'Add Message', value: 4 },
			{ name: 'Change Severity', value: 8 },
			{ name: 'Unacknowledge', value: 16 },
			{ name: 'Suppress', value: 32 },
			{ name: 'Unsuppress', value: 64 },
		],
		displayOptions: showFor('acknowledge'),
	},
	{
		displayName: 'Message',
		name: 'message',
		type: 'string',
		typeOptions: { rows: 2 },
		default: '',
		description: 'Text of the message to add (used with the Add Message action)',
		displayOptions: showFor('acknowledge'),
	},
];

export const handlers: IZabbixResourceModule['handlers'] = {
	async getAll(this: IExecuteFunctions, i: number): Promise<INodeExecutionData[]> {
		const params = buildCommonGetParams.call(this, i);

		const eventids = toIdArray(this.getNodeParameter('eventids', i, ''));
		if (eventids.length) params.eventids = eventids;
		for (const filter of getFilters) {
			const values = toIdArray(this.getNodeParameter(filter.name, i, ''));
			if (values.length) params[filter.name] = values;
		}
		const selects = this.getNodeParameter('selects', i, []) as string[];
		for (const select of selects) params[select] = 'extend';

		const result = await zabbixApiRequest.call(this, 'event.get', params);
		return wrapZabbixResult(result, i);
	},

	async acknowledge(this: IExecuteFunctions, i: number): Promise<INodeExecutionData[]> {
		const eventids = toIdArray(this.getNodeParameter('ackEventids', i));
		const actions = this.getNodeParameter('action', i, []) as number[];
		const message = this.getNodeParameter('message', i, '') as string;

		const params: IDataObject = {
			eventids,
			action: actions.reduce((sum, flag) => sum + flag, 0),
		};
		if (message) params.message = message;

		const result = await zabbixApiRequest.call(this, 'event.acknowledge', params);
		return wrapZabbixResult(result, i);
	},
};
