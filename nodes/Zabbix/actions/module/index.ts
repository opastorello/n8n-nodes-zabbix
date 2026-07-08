import { createCrudResource } from '../../helpers/resourceFactory';

const resourceModule = createCrudResource({
	resource: 'module',
	displayName: 'Module',
	apiObject: 'module',
	getCommonOpts: { noNameSearch: true },
	idField: 'moduleid',
	writeFields: [
		{ displayName: 'Relative Path', name: 'relative_path', type: 'string', default: '', description: 'Directory name of the frontend module (required on create)' },
		{
			displayName: 'Status',
			name: 'status',
			type: 'options',
			default: 0,
			description: 'Whether the module is enabled',
			options: [
				{ name: 'Disabled', value: 0 },
				{ name: 'Enabled', value: 1 },
			],
		},
	],
});

export const description = resourceModule.description;
export const handlers = resourceModule.handlers;
