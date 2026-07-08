import { createCrudResource } from '../../helpers/resourceFactory';

const resourceModule = createCrudResource({
	resource: 'templatedashboard',
	displayName: 'Template Dashboard',
	apiObject: 'templatedashboard',
	idField: 'dashboardid',
	getFilters: [
		{ name: 'templateids', displayName: 'Template IDs', description: 'Return dashboards of the given templates' },
	],
	selects: [{ name: 'Pages', value: 'selectPages' }],
	jsonWriteKeys: ['pages'],
	writeFields: [
		{ displayName: 'Name', name: 'name', type: 'string', default: '', description: 'Name of the template dashboard (required on create)' },
		{ displayName: 'Template ID', name: 'templateid', type: 'string', default: '', description: 'Template the dashboard belongs to (required on create)' },
		{ displayName: 'Display Period', name: 'display_period', type: 'number', default: 30, description: 'Default page display period in seconds' },
		{ displayName: 'Pages (JSON)', name: 'pages', type: 'json', default: '', description: 'Array of dashboard page objects (required on create)' },
	],
});

export const description = resourceModule.description;
export const handlers = resourceModule.handlers;
