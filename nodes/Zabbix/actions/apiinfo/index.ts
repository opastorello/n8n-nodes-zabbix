import type { IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';

import type { IZabbixResourceModule } from '../../helpers/interfaces';
import { wrapZabbixResult } from '../../helpers/utils';
import { zabbixApiRequest } from '../../transport';

const resource = 'apiinfo';

export const description: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: [resource] } },
		options: [
			{
				name: 'Get Version',
				value: 'version',
				action: 'Get the API version',
				description: 'Return the Zabbix API version — also useful as a connectivity check',
			},
		],
		default: 'version',
	},
];

export const handlers: IZabbixResourceModule['handlers'] = {
	async version(this: IExecuteFunctions, i: number): Promise<INodeExecutionData[]> {
		const result = await zabbixApiRequest.call(this, 'apiinfo.version', {});
		return wrapZabbixResult(result, i);
	},
};
