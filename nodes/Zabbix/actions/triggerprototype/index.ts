import { createCrudResource } from '../../helpers/resourceFactory';

const resourceModule = createCrudResource({
	resource: 'triggerprototype',
	displayName: 'Trigger Prototype',
	apiObject: 'triggerprototype',
	idField: 'triggerid',
	getFilters: [
		{ name: 'discoveryids', displayName: 'LLD Rule IDs', description: 'Return trigger prototypes of the given LLD rules' },
		{ name: 'hostids', displayName: 'Host IDs', description: 'Return trigger prototypes of the given hosts' },
	],
	selects: [
		{ name: 'Dependencies', value: 'selectDependencies' },
		{ name: 'Tags', value: 'selectTags' },
	],
	jsonWriteKeys: ['tags', 'dependencies'],
	writeFields: [
		{ displayName: 'Description', name: 'description', type: 'string', default: '', description: 'Name of the trigger prototype (required on create)' },
		{ displayName: 'Expression', name: 'expression', type: 'string', default: '', description: 'Trigger prototype expression with an LLD macro (required on create)' },
		{
			displayName: 'Priority',
			name: 'priority',
			type: 'options',
			default: 0,
			description: 'Severity of the trigger prototype',
			options: [
				{ name: 'Not Classified', value: 0 },
				{ name: 'Information', value: 1 },
				{ name: 'Warning', value: 2 },
				{ name: 'Average', value: 3 },
				{ name: 'High', value: 4 },
				{ name: 'Disaster', value: 5 },
			],
		},
	],
});

export const description = resourceModule.description;
export const handlers = resourceModule.handlers;
