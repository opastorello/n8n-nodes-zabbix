import type { IDataObject, IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';

import { buildCommonGetParams, getCommonDescription } from '../../descriptions/getCommon.description';
import type { IZabbixResourceModule } from '../../helpers/interfaces';
import { parseJsonParameter, toIdArray, wrapZabbixResult } from '../../helpers/utils';
import { zabbixApiRequest } from '../../transport';

const resource = 'task';
const showFor = (op: string) => ({ show: { resource: [resource], operation: [op] } });

export const description: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: [resource] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				action: 'Create a task',
				description: 'Create a task, e.g. a "check now" request for an item or LLD rule',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many tasks',
				description: 'Retrieve the status of previously created tasks',
			},
		],
		default: 'getAll',
	},
	{
		displayName: 'Task IDs',
		name: 'taskids',
		type: 'string',
		default: '',
		description: 'Comma-separated task IDs to return (leave empty for all)',
		displayOptions: showFor('getAll'),
	},
	...getCommonDescription(resource, 'getAll', { noNameSearch: true }),
	{
		displayName: 'Request (JSON)',
		name: 'request',
		type: 'json',
		default: '{}',
		required: true,
		placeholder: '{ "type": 6, "request": { "itemid": "10092" } }',
		description:
			'Task definition to create. For example, a "check now" task: <code>{"type":6,"request":{"itemid":"10092"}}</code>.',
		displayOptions: showFor('create'),
	},
];

export const handlers: IZabbixResourceModule['handlers'] = {
	async create(this: IExecuteFunctions, i: number): Promise<INodeExecutionData[]> {
		const request = parseJsonParameter.call(
			this,
			this.getNodeParameter('request', i, {}),
			'Request (JSON)',
			i,
		);
		const result = await zabbixApiRequest.call(this, 'task.create', request as IDataObject);
		return wrapZabbixResult(result, i);
	},

	async getAll(this: IExecuteFunctions, i: number): Promise<INodeExecutionData[]> {
		const params = buildCommonGetParams.call(this, i);
		const taskids = toIdArray(this.getNodeParameter('taskids', i, ''));
		if (taskids.length) params.taskids = taskids;
		const result = await zabbixApiRequest.call(this, 'task.get', params);
		return wrapZabbixResult(result, i);
	},
};
