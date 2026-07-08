import { createCrudResource, tagsField } from '../../helpers/resourceFactory';

const resourceModule = createCrudResource({
	resource: 'connector',
	displayName: 'Connector',
	apiObject: 'connector',
	idField: 'connectorid',
	selects: [{ name: 'Tags', value: 'selectTags' }],
	jsonWriteKeys: ['tags'],
	writeFields: [
		{ displayName: 'Name', name: 'name', type: 'string', default: '', description: 'Name of the connector (required on create)' },
		{ displayName: 'URL', name: 'url', type: 'string', default: '', description: 'URL the connector streams data to (required on create)' },
		{
			displayName: 'Data Type',
			name: 'data_type',
			type: 'options',
			default: 0,
			description: 'Type of data streamed by the connector',
			options: [
				{ name: 'Item Values', value: 0 },
				{ name: 'Events', value: 1 },
			],
		},
		{
			displayName: 'Status',
			name: 'status',
			type: 'options',
			default: 1,
			description: 'Whether the connector is enabled',
			options: [
				{ name: 'Enabled', value: 1 },
				{ name: 'Disabled', value: 0 },
			],
		},
		tagsField('connector'),
	],
});

export const description = resourceModule.description;
export const handlers = resourceModule.handlers;
