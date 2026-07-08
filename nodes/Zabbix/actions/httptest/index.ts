import { createCrudResource, tagsField } from '../../helpers/resourceFactory';

const resourceModule = createCrudResource({
	resource: 'httptest',
	displayName: 'Web Scenario',
	apiObject: 'httptest',
	idField: 'httptestid',
	getFilters: [
		{ name: 'hostids', displayName: 'Host IDs', description: 'Return web scenarios of the given hosts' },
		{ name: 'groupids', displayName: 'Group IDs', description: 'Return web scenarios of hosts in the given groups' },
	],
	selects: [
		{ name: 'Hosts', value: 'selectHosts' },
		{ name: 'Steps', value: 'selectSteps' },
		{ name: 'Tags', value: 'selectTags' },
	],
	jsonWriteKeys: ['steps', 'tags', 'variables', 'headers'],
	writeFields: [
		{ displayName: 'Name', name: 'name', type: 'string', default: '', description: 'Name of the web scenario (required on create)' },
		{ displayName: 'Host ID', name: 'hostid', type: 'string', default: '', description: 'Host the web scenario belongs to (required on create)' },
		{ displayName: 'Update Interval', name: 'delay', type: 'string', default: '', placeholder: '1m', description: 'How often the scenario is executed' },
		{ displayName: 'Steps (JSON)', name: 'steps', type: 'json', default: '', description: 'Array of scenario step objects (required on create)' },
		tagsField('web scenario'),
	],
});

export const description = resourceModule.description;
export const handlers = resourceModule.handlers;
