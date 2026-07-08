import { createCrudResource } from '../../helpers/resourceFactory';

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

export const description = resourceModule.description;
export const handlers = resourceModule.handlers;
