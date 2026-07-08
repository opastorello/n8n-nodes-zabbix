import type {
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { resourceOptions, resources } from './actions';
import { loadOptionsMethods } from './methods/loadOptions';

const resourceProperties = Object.values(resources).flatMap((module) => module.description);

export class Zabbix implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Zabbix',
		name: 'zabbix',
		icon: { light: 'file:../../icons/zabbix.svg', dark: 'file:../../icons/zabbix.dark.svg' },
		group: ['input'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Interact with the Zabbix 7.4 JSON-RPC API',
		defaults: {
			name: 'Zabbix',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'zabbixTokenApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: resourceOptions,
				default: 'host',
			},
			...resourceProperties,
		],
	};

	methods = {
		loadOptions: loadOptionsMethods as unknown as Record<
			string,
			(this: ILoadOptionsFunctions) => Promise<INodePropertyOptions[]>
		>,
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		const resource = this.getNodeParameter('resource', 0) as string;
		const module = resources[resource];
		if (!module) {
			throw new NodeOperationError(this.getNode(), `Unknown resource: "${resource}"`);
		}

		for (let i = 0; i < items.length; i++) {
			try {
				const operation = this.getNodeParameter('operation', i) as string;

				const handler = module.handlers[operation];
				if (!handler) {
					throw new NodeOperationError(
						this.getNode(),
						`Operation "${operation}" is not supported for resource "${resource}"`,
						{ itemIndex: i },
					);
				}

				const results = await handler.call(this, i);
				returnData.push(...results);
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
					continue;
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}

		return [returnData];
	}
}
