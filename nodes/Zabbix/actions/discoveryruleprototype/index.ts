import { createCrudResource } from '../../helpers/resourceFactory';

const resourceModule = createCrudResource({
	resource: 'discoveryruleprototype',
	displayName: 'LLD Rule Prototype',
	apiObject: 'discoveryruleprototype',
	idField: 'itemid',
	getFilters: [
		{ name: 'discoveryids', displayName: 'LLD Rule IDs', description: 'Return LLD rule prototypes of the given LLD rules' },
		{ name: 'hostids', displayName: 'Host IDs', description: 'Return LLD rule prototypes of the given hosts' },
	],
	selects: [{ name: 'Discovery Rule', value: 'selectDiscoveryRule' }],
	writeFields: [
		{ displayName: 'Name', name: 'name', type: 'string', default: '', description: 'Name of the LLD rule prototype (required on create)' },
		{ displayName: 'Key', name: 'key_', type: 'string', default: '', description: 'Key with an LLD macro (required on create)' },
		{ displayName: 'Host ID', name: 'hostid', type: 'string', default: '', description: 'Host the prototype belongs to (required on create)' },
		{ displayName: 'LLD Rule ID', name: 'ruleid', type: 'string', default: '', description: 'Parent LLD rule (required on create)' },
	],
});

export const description = resourceModule.description;
export const handlers = resourceModule.handlers;
