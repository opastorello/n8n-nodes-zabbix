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
				{ name: 'Information', value: 1, description: 'Informational — not a real problem' },
				{ name: 'Warning', value: 2, description: 'Warning-level problem' },
				{ name: 'Average', value: 3, description: 'Average-severity problem' },
				{ name: 'High', value: 4, description: 'High-severity problem' },
				{ name: 'Disaster', value: 5, description: 'Most severe — service-impacting' },
			],
		},
	],
});

export const description = resourceModule.description;
export const handlers = resourceModule.handlers;
