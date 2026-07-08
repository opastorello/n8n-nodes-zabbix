import type { IDataObject, IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';

import { buildCommonGetParams, getCommonDescription } from '../../descriptions/getCommon.description';
import type { IZabbixResourceModule } from '../../helpers/interfaces';
import { removeEmpty, toIdArray, wrapZabbixResult } from '../../helpers/utils';
import { zabbixApiRequest } from '../../transport';

// Global user macros use the *global* method variants
// (createglobal/updateglobal/deleteglobal). Host/template macros are managed
// through the Host and Template resources.
const resource = 'usermacro';
const showFor = (operation: string) => ({ show: { resource: [resource], operation: [operation] } });

export const description: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: [resource] } },
		options: [
			{ name: 'Create', value: 'create', action: 'Create a global macro', description: 'Create a new global user macro' },
			{ name: 'Delete', value: 'delete', action: 'Delete global macros', description: 'Permanently delete one or more global macros by ID' },
			{ name: 'Get Many', value: 'getAll', action: 'Get many user macros', description: 'Retrieve global or host user macros' },
			{ name: 'Update', value: 'update', action: 'Update a global macro', description: 'Update an existing global macro by ID' },
		],
		default: 'getAll',
	},
	{
		displayName: 'Global Macro ID',
		name: 'globalmacroid',
		type: 'string',
		default: '',
		required: true,
		description: 'ID of the global macro to update',
		displayOptions: showFor('update'),
	},
	{
		displayName: 'Macro',
		name: 'macro',
		type: 'string',
		default: '',
		required: true,
		placeholder: '{$MACRO}',
		description: 'Macro name including the surrounding {$ }',
		displayOptions: showFor('create'),
	},
	{
		displayName: 'Macro',
		name: 'macro',
		type: 'string',
		default: '',
		placeholder: '{$MACRO}',
		description: 'New macro name including the surrounding {$ } (leave empty to keep unchanged)',
		displayOptions: showFor('update'),
	},
	{
		displayName: 'Value',
		name: 'value',
		type: 'string',
		default: '',
		required: true,
		description: 'Value of the macro',
		displayOptions: showFor('create'),
	},
	{
		displayName: 'Value',
		name: 'value',
		type: 'string',
		default: '',
		description: 'New value of the macro (leave empty to keep unchanged)',
		displayOptions: showFor('update'),
	},
	{
		displayName: 'Description',
		name: 'macroDescription',
		type: 'string',
		default: '',
		description: 'Description of the macro',
		displayOptions: { show: { resource: [resource], operation: ['create', 'update'] } },
	},
	{
		displayName: 'Global Macro IDs',
		name: 'globalmacroids',
		type: 'string',
		default: '',
		required: true,
		description: 'Comma-separated global macro IDs to delete',
		displayOptions: showFor('delete'),
	},
	{
		displayName: 'Global Only',
		name: 'globalmacro',
		type: 'boolean',
		default: true,
		description: 'Whether to return only global macros',
		displayOptions: showFor('getAll'),
	},
	{
		displayName: 'Host IDs',
		name: 'hostids',
		type: 'string',
		default: '',
		description: 'Return host macros for the given hosts (when Global Only is off)',
		displayOptions: showFor('getAll'),
	},
	...getCommonDescription(resource, 'getAll', { noNameSearch: true }),
];

function buildBody(this: IExecuteFunctions, i: number, isUpdate: boolean): IDataObject {
	const body: IDataObject = {
		macro: this.getNodeParameter('macro', i, '') as string,
		value: this.getNodeParameter('value', i, '') as string,
		description: this.getNodeParameter('macroDescription', i, '') as string,
	};
	if (isUpdate) body.globalmacroid = this.getNodeParameter('globalmacroid', i) as string;
	return removeEmpty(body);
}

export const handlers: IZabbixResourceModule['handlers'] = {
	async create(this: IExecuteFunctions, i: number): Promise<INodeExecutionData[]> {
		const result = await zabbixApiRequest.call(this, 'usermacro.createglobal', buildBody.call(this, i, false));
		return wrapZabbixResult(result, i);
	},
	async update(this: IExecuteFunctions, i: number): Promise<INodeExecutionData[]> {
		const result = await zabbixApiRequest.call(this, 'usermacro.updateglobal', buildBody.call(this, i, true));
		return wrapZabbixResult(result, i);
	},
	async delete(this: IExecuteFunctions, i: number): Promise<INodeExecutionData[]> {
		const ids = toIdArray(this.getNodeParameter('globalmacroids', i));
		const result = await zabbixApiRequest.call(this, 'usermacro.deleteglobal', ids);
		return wrapZabbixResult(result, i);
	},
	async getAll(this: IExecuteFunctions, i: number): Promise<INodeExecutionData[]> {
		const params = buildCommonGetParams.call(this, i);
		if (this.getNodeParameter('globalmacro', i, true) as boolean) {
			params.globalmacro = true;
		}
		const hostids = toIdArray(this.getNodeParameter('hostids', i, ''));
		if (hostids.length) params.hostids = hostids;
		const result = await zabbixApiRequest.call(this, 'usermacro.get', params);
		return wrapZabbixResult(result, i);
	},
};
