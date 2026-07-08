import { createCrudResource } from '../../helpers/resourceFactory';

const resourceModule = createCrudResource({
	resource: 'role',
	displayName: 'Role',
	apiObject: 'role',
	idField: 'roleid',
	selects: [
		{ name: 'Rules', value: 'selectRules' },
		{ name: 'Users', value: 'selectUsers' },
	],
	jsonWriteKeys: ['rules'],
	writeFields: [
		{ displayName: 'Name', name: 'name', type: 'string', default: '', description: 'Name of the role (required on create)' },
		{
			displayName: 'User Type',
			name: 'type',
			type: 'options',
			default: 1,
			description: 'Base user type of the role',
			options: [
				{ name: 'User', value: 1 },
				{ name: 'Admin', value: 2 },
				{ name: 'Super Admin', value: 3 },
			],
		},
		{ displayName: 'Rules (JSON)', name: 'rules', type: 'json', default: '', description: 'Access rules object for the role' },
	],
});

export const description = resourceModule.description;
export const handlers = resourceModule.handlers;
