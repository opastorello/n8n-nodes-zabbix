import type { IDataObject, IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { buildCommonGetParams, getCommonDescription } from '../../descriptions/getCommon.description';
import type { IZabbixResourceModule } from '../../helpers/interfaces';
import { parseJsonParameter, toIdArray, wrapZabbixResult } from '../../helpers/utils';
import { zabbixApiRequest } from '../../transport';

const resource = 'history';
const showFor = (operation: string) => ({ show: { resource: [resource], operation: [operation] } });

const historyTypeField: INodeProperties = {
	displayName: 'History Type',
	name: 'history',
	type: 'options',
	default: 3,
	description: 'Type of the item values to work with (must match the item value type)',
	options: [
		{ name: 'Numeric (Float)', value: 0 },
		{ name: 'Character', value: 1 },
		{ name: 'Log', value: 2 },
		{ name: 'Numeric (Unsigned)', value: 3 },
		{ name: 'Text', value: 4 },
	],
};

export const description: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: [resource] } },
		options: [
			{
				name: 'Clear',
				value: 'clear',
				action: 'Clear history for items',
				description: 'Permanently delete the collected history of the given items',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many history values',
				description: 'Retrieve collected metric values for items within a time range',
			},
			{
				name: 'Push',
				value: 'push',
				action: 'Push history values',
				description: 'Inject values into item history (trapper/HTTP items)',
			},
		],
		default: 'getAll',
	},
	{ ...historyTypeField, displayOptions: showFor('getAll') },
	{
		displayName: 'Item IDs',
		name: 'itemids',
		type: 'string',
		default: '',
		description: 'Comma-separated item IDs to return history for',
		displayOptions: showFor('getAll'),
	},
	{
		displayName: 'Time From',
		name: 'time_from',
		type: 'number',
		default: 0,
		description: 'Return only values with a timestamp at or after this Unix time (0 to ignore)',
		displayOptions: showFor('getAll'),
	},
	{
		displayName: 'Time Till',
		name: 'time_till',
		type: 'number',
		default: 0,
		description: 'Return only values with a timestamp at or before this Unix time (0 to ignore)',
		displayOptions: showFor('getAll'),
	},
	...getCommonDescription(resource, 'getAll', { noNameSearch: true }),
	{
		displayName: 'Values (JSON)',
		name: 'pushValues',
		type: 'json',
		default: '[]',
		description:
			'Array of value objects to push, e.g. <code>[{"itemid":123,"value":"5","clock":1700000000}]</code>',
		displayOptions: showFor('push'),
	},
	{
		displayName: 'Item IDs',
		name: 'clearItemids',
		type: 'string',
		default: '',
		required: true,
		description: 'Comma-separated item IDs whose history should be cleared',
		displayOptions: showFor('clear'),
	},
];

export const handlers: IZabbixResourceModule['handlers'] = {
	async getAll(this: IExecuteFunctions, i: number): Promise<INodeExecutionData[]> {
		const params = buildCommonGetParams.call(this, i);
		params.history = this.getNodeParameter('history', i, 3);

		const itemids = toIdArray(this.getNodeParameter('itemids', i, ''));
		if (itemids.length) params.itemids = itemids;

		const timeFrom = this.getNodeParameter('time_from', i, 0) as number;
		if (timeFrom) params.time_from = timeFrom;
		const timeTill = this.getNodeParameter('time_till', i, 0) as number;
		if (timeTill) params.time_till = timeTill;

		const result = await zabbixApiRequest.call(this, 'history.get', params);
		return wrapZabbixResult(result, i);
	},

	async push(this: IExecuteFunctions, i: number): Promise<INodeExecutionData[]> {
		const values = parseJsonParameter.call(
			this,
			this.getNodeParameter('pushValues', i, []),
			'Values (JSON)',
			i,
		);
		const result = (await zabbixApiRequest.call(this, 'history.push', values as IDataObject)) as {
			response?: string;
			data?: Array<{ error?: string }>;
		};

		// history.push reports overall "success" even when individual values are
		// rejected — surface per-value errors instead of silently succeeding.
		const valueErrors = (result?.data ?? [])
			.map((entry, index) => (entry?.error ? `value #${index + 1}: ${entry.error}` : null))
			.filter((entry): entry is string => entry !== null);
		if (valueErrors.length) {
			throw new NodeOperationError(
				this.getNode(),
				`history.push rejected ${valueErrors.length} value(s)`,
				{
					itemIndex: i,
					description:
						valueErrors.join('; ') +
						'. Values are only accepted for existing trapper/HTTP items — note the Zabbix server config cache may take up to a minute to pick up newly created items.',
				},
			);
		}
		return wrapZabbixResult(result as IDataObject, i);
	},

	async clear(this: IExecuteFunctions, i: number): Promise<INodeExecutionData[]> {
		const itemids = toIdArray(this.getNodeParameter('clearItemids', i));
		const result = await zabbixApiRequest.call(this, 'history.clear', itemids);
		return wrapZabbixResult(result, i);
	},
};
