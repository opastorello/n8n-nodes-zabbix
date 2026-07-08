import { createCrudResource } from '../../helpers/resourceFactory';

const resourceModule = createCrudResource({
	resource: 'correlation',
	displayName: 'Correlation',
	apiObject: 'correlation',
	idField: 'correlationid',
	selects: [
		{ name: 'Filter', value: 'selectFilter' },
		{ name: 'Operations', value: 'selectOperations' },
	],
	jsonWriteKeys: ['filter', 'operations'],
	writeFields: [
		{ displayName: 'Name', name: 'name', type: 'string', default: '', description: 'Name of the correlation (required on create)' },
		{
			displayName: 'Status',
			name: 'status',
			type: 'options',
			default: 0,
			description: 'Whether the correlation is enabled',
			options: [
				{ name: 'Enabled', value: 0 },
				{ name: 'Disabled', value: 1 },
			],
		},
		{ displayName: 'Filter (JSON)', name: 'filter', type: 'json', default: '', description: 'Correlation condition filter object (required on create)' },
		{ displayName: 'Operations (JSON)', name: 'operations', type: 'json', default: '', description: 'Array of operation objects (required on create)' },
	],
});

export const description = resourceModule.description;
export const handlers = resourceModule.handlers;
