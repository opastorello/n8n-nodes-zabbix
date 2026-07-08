import { createCrudResource } from '../../helpers/resourceFactory';

const resourceModule = createCrudResource({
	resource: 'action',
	displayName: 'Action',
	apiObject: 'action',
	idField: 'actionid',
	getFilters: [
		{ name: 'actionids', displayName: 'Action IDs', description: 'Return only the given actions' },
	],
	selects: [
		{ name: 'Filter', value: 'selectFilter' },
		{ name: 'Operations', value: 'selectOperations' },
		{ name: 'Recovery Operations', value: 'selectRecoveryOperations' },
		{ name: 'Update Operations', value: 'selectUpdateOperations' },
	],
	jsonWriteKeys: ['filter', 'operations', 'recovery_operations', 'update_operations'],
	writeFields: [
		{ displayName: 'Name', name: 'name', type: 'string', default: '', description: 'Name of the action (required on create)' },
		{
			displayName: 'Event Source',
			name: 'eventsource',
			type: 'options',
			default: 0,
			description: 'Type of events the action handles',
			options: [
				{ name: 'Trigger', value: 0 },
				{ name: 'Discovery', value: 1 },
				{ name: 'Auto Registration', value: 2 },
				{ name: 'Internal', value: 3 },
				{ name: 'Service', value: 4 },
			],
		},
		{
			displayName: 'Status',
			name: 'status',
			type: 'options',
			default: 0,
			description: 'Whether the action is enabled',
			options: [
				{ name: 'Enabled', value: 0 },
				{ name: 'Disabled', value: 1 },
			],
		},
		{ displayName: 'Filter (JSON)', name: 'filter', type: 'json', default: '', description: 'Action condition filter object' },
		{ displayName: 'Operations (JSON)', name: 'operations', type: 'json', default: '', description: 'Array of operation objects' },
	],
});

export const description = resourceModule.description;
export const handlers = resourceModule.handlers;
