import { createCrudResource, tagsField } from '../../helpers/resourceFactory';

const resourceModule = createCrudResource({
	resource: 'trigger',
	displayName: 'Trigger',
	apiObject: 'trigger',
	idField: 'triggerid',
	getFilters: [
		{ name: 'hostids', displayName: 'Host IDs', description: 'Return triggers belonging to the given hosts' },
		{ name: 'groupids', displayName: 'Group IDs', description: 'Return triggers belonging to hosts in the given groups' },
		{ name: 'templateids', displayName: 'Template IDs', description: 'Return triggers belonging to the given templates' },
	],
	selects: [
		{ name: 'Dependencies', value: 'selectDependencies' },
		{ name: 'Hosts', value: 'selectHosts' },
		{ name: 'Items', value: 'selectItems' },
		{ name: 'Tags', value: 'selectTags' },
	],
	jsonWriteKeys: ['tags', 'dependencies'],
	writeFields: [
		{
			displayName: 'Description',
			name: 'description',
			type: 'string',
			default: '',
			description: 'Name of the trigger (required on create)',
		},
		{
			displayName: 'Expression',
			name: 'expression',
			type: 'string',
			default: '',
			placeholder: 'last(/host/key)>0',
			description: 'Trigger expression (required on create)',
		},
		{
			displayName: 'Priority',
			name: 'priority',
			type: 'options',
			default: 0,
			description: 'Severity of the trigger',
			options: [
				{ name: 'Not Classified', value: 0 },
				{ name: 'Information', value: 1, description: 'Informational — not a real problem' },
				{ name: 'Warning', value: 2, description: 'Warning-level problem' },
				{ name: 'Average', value: 3, description: 'Average-severity problem' },
				{ name: 'High', value: 4, description: 'High-severity problem' },
				{ name: 'Disaster', value: 5, description: 'Most severe — service-impacting' },
			],
		},
		{
			displayName: 'Status',
			name: 'status',
			type: 'options',
			default: 0,
			description: 'Whether the trigger is enabled',
			options: [
				{ name: 'Enabled', value: 0, description: 'Trigger is active' },
				{ name: 'Disabled', value: 1, description: 'Trigger is turned off' },
			],
		},
		{
			displayName: 'Comments',
			name: 'comments',
			type: 'string',
			typeOptions: { rows: 3 },
			default: '',
			description: 'Additional description of the trigger',
		},
		{
			displayName: 'Recovery Mode',
			name: 'recovery_mode',
			type: 'options',
			default: 0,
			description: 'How the trigger recovers',
			options: [
				{ name: 'Expression', value: 0 },
				{ name: 'Recovery Expression', value: 1 },
				{ name: 'None', value: 2 },
			],
		},
		{
			displayName: 'Recovery Expression',
			name: 'recovery_expression',
			type: 'string',
			default: '',
			description: 'Trigger recovery expression (used when recovery mode is Recovery Expression)',
		},
		tagsField('trigger'),
		{
			displayName: 'Dependencies (JSON)',
			name: 'dependencies',
			type: 'json',
			default: '',
			description: 'Array of dependency objects, e.g. <code>[{"triggerid":"1234"}]</code>',
		},
	],
});

export const description = resourceModule.description;
export const handlers = resourceModule.handlers;
