import type { IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';

import { createCrudResource } from '../../helpers/resourceFactory';
import { wrapZabbixResult } from '../../helpers/utils';
import { webhookMediaType } from '../../helpers/webhookMediaType';
import { zabbixApiRequest } from '../../transport';

const resourceModule = createCrudResource({
	resource: 'mediatype',
	displayName: 'Media Type',
	apiObject: 'mediatype',
	idField: 'mediatypeid',
	selects: [{ name: 'Message Templates', value: 'selectMessageTemplates' }],
	jsonWriteKeys: ['parameters', 'message_templates'],
	writeFields: [
		{ displayName: 'Name', name: 'name', type: 'string', default: '', description: 'Name of the media type (required on create)' },
		{
			displayName: 'Type',
			name: 'type',
			type: 'options',
			default: 0,
			description: 'Transport used by the media type',
			options: [
				{ name: 'Email', value: 0 },
				{ name: 'Script', value: 1 },
				{ name: 'SMS', value: 2 },
				{ name: 'Webhook', value: 4 },
			],
		},
		{
			displayName: 'Status',
			name: 'status',
			type: 'options',
			default: 0,
			description: 'Whether the media type is enabled',
			options: [
				{ name: 'Enabled', value: 0, description: 'Media type is available for sending' },
				{ name: 'Disabled', value: 1, description: 'Media type is turned off' },
			],
		},
		{ displayName: 'Parameters (JSON)', name: 'parameters', type: 'json', default: '', description: 'Array of parameter objects (for script/webhook media types)' },
	],
});

const showWebhook = { show: { resource: ['mediatype'], operation: ['createN8nWebhook'] } };

const webhookFields: INodeProperties[] = [
	{
		displayName: 'Webhook URL',
		name: 'n8nWebhookUrl',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'https://n8n.example.com/webhook/…/zabbix',
		description: "The Production URL of a Zabbix Webhook Trigger node — it must be reachable from the Zabbix server",
		displayOptions: showWebhook,
	},
	{
		displayName: 'Shared Secret',
		name: 'n8nWebhookSecret',
		type: 'string',
		typeOptions: { password: true },
		default: '',
		description: 'Sent as the X-Zabbix-Token header; set the same value on the trigger node',
		displayOptions: showWebhook,
	},
	{
		displayName: 'Media Type Name',
		name: 'n8nWebhookName',
		type: 'string',
		default: 'n8n',
		displayOptions: showWebhook,
	},
];

const operationSelect = resourceModule.description.find((p) => p.name === 'operation') as INodeProperties;
operationSelect.options = [
	...(operationSelect.options ?? []),
	{
		name: 'Create Webhook Media Type',
		value: 'createN8nWebhook',
		action: 'Create a webhook media type for n8n',
		description: 'Create a webhook media type that sends every alert to a Zabbix Webhook Trigger node',
	},
].sort((a, b) => String(a.name).localeCompare(String(b.name)));

export const description: INodeProperties[] = [...resourceModule.description, ...webhookFields];

export const handlers = {
	...resourceModule.handlers,

	async createN8nWebhook(this: IExecuteFunctions, i: number): Promise<INodeExecutionData[]> {
		const url = String(this.getNodeParameter('n8nWebhookUrl', i)).trim();
		const secret = String(this.getNodeParameter('n8nWebhookSecret', i, ''));
		const name = String(this.getNodeParameter('n8nWebhookName', i, 'n8n'));
		const result = await zabbixApiRequest.call(this, 'mediatype.create', webhookMediaType(name, url, secret));
		return wrapZabbixResult(result, i);
	},
};
