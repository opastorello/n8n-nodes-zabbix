import { createCrudResource } from '../../helpers/resourceFactory';

const resourceModule = createCrudResource({
	resource: 'dashboard',
	displayName: 'Dashboard',
	apiObject: 'dashboard',
	idField: 'dashboardid',
	selects: [
		{ name: 'Pages', value: 'selectPages' },
		{ name: 'Users', value: 'selectUsers' },
		{ name: 'User Groups', value: 'selectUserGroups' },
	],
	jsonWriteKeys: ['pages', 'users', 'userGroups'],
	writeFields: [
		{ displayName: 'Name', name: 'name', type: 'string', default: '', description: 'Name of the dashboard (required on create)' },
		{ displayName: 'Display Period', name: 'display_period', type: 'number', default: 30, description: 'Default page display period in seconds' },
		{ displayName: 'Pages (JSON)', name: 'pages', type: 'json', default: '', description: 'Array of dashboard page objects (required on create)' },
	],
});

export const description = resourceModule.description;
export const handlers = resourceModule.handlers;
