import type { IDataObject, IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';

import type { IZabbixResourceModule } from '../../helpers/interfaces';
import { parseJsonParameter, wrapZabbixResult } from '../../helpers/utils';
import { zabbixApiRequest } from '../../transport';

const resource = 'configuration';
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
				name: 'Export',
				value: 'export',
				action: 'Export configuration',
				description: 'Export hosts, templates and other objects as JSON/XML/YAML',
			},
			{
				name: 'Import',
				value: 'import',
				action: 'Import configuration',
				description: 'Import a configuration file, controlled by import rules',
			},
			{
				name: 'Import Compare',
				value: 'importcompare',
				action: 'Compare configuration before import',
				description: 'Preview what an import would add, update or delete — without applying it',
			},
		],
		default: 'export',
	},
	{
		displayName: 'Format',
		name: 'format',
		type: 'options',
		default: 'json',
		description: 'Serialization format',
		options: [
			{ name: 'JSON', value: 'json' },
			{ name: 'XML', value: 'xml' },
			{ name: 'YAML', value: 'yaml' },
		],
		displayOptions: { show: { resource: [resource], operation: ['export', 'import', 'importcompare'] } },
	},
	{
		displayName: 'Options (JSON)',
		name: 'exportOptions',
		type: 'json',
		default: '{}',
		description: 'Objects to export, e.g. <code>{"hosts":["10084"],"templates":["10001"]}</code>',
		displayOptions: showFor('export'),
	},
	{
		displayName: 'Source',
		name: 'source',
		type: 'string',
		typeOptions: { rows: 6 },
		default: '',
		description: 'Serialized configuration to import (in the chosen format)',
		displayOptions: { show: { resource: [resource], operation: ['import', 'importcompare'] } },
	},
	{
		displayName: 'Rules (JSON)',
		name: 'rules',
		type: 'json',
		default: '{}',
		description: 'Import rules controlling what is created/updated/deleted',
		displayOptions: { show: { resource: [resource], operation: ['import', 'importcompare'] } },
	},
];

export const handlers: IZabbixResourceModule['handlers'] = {
	async export(this: IExecuteFunctions, i: number): Promise<INodeExecutionData[]> {
		const params: IDataObject = {
			format: this.getNodeParameter('format', i, 'json') as string,
			options: parseJsonParameter.call(this, this.getNodeParameter('exportOptions', i, {}), 'Options (JSON)', i),
		};
		const result = await zabbixApiRequest.call(this, 'configuration.export', params);
		return wrapZabbixResult(result, i);
	},
	async import(this: IExecuteFunctions, i: number): Promise<INodeExecutionData[]> {
		const params: IDataObject = {
			format: this.getNodeParameter('format', i, 'json') as string,
			source: this.getNodeParameter('source', i) as string,
			rules: parseJsonParameter.call(this, this.getNodeParameter('rules', i, {}), 'Rules (JSON)', i),
		};
		const result = await zabbixApiRequest.call(this, 'configuration.import', params);
		return wrapZabbixResult(result, i);
	},
	async importcompare(this: IExecuteFunctions, i: number): Promise<INodeExecutionData[]> {
		const params: IDataObject = {
			format: this.getNodeParameter('format', i, 'json') as string,
			source: this.getNodeParameter('source', i) as string,
			rules: parseJsonParameter.call(this, this.getNodeParameter('rules', i, {}), 'Rules (JSON)', i),
		};
		const result = await zabbixApiRequest.call(this, 'configuration.importcompare', params);
		return wrapZabbixResult(result, i);
	},
};
