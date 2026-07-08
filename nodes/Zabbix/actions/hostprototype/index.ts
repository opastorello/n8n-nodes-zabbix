import { createCrudResource } from '../../helpers/resourceFactory';

const resourceModule = createCrudResource({
	resource: 'hostprototype',
	displayName: 'Host Prototype',
	apiObject: 'hostprototype',
	idField: 'hostid',
	getFilters: [
		{ name: 'discoveryids', displayName: 'LLD Rule IDs', description: 'Return host prototypes of the given LLD rules' },
	],
	selects: [
		{ name: 'Discovery Rule', value: 'selectDiscoveryRule' },
		{ name: 'Group Links', value: 'selectGroupLinks' },
		{ name: 'Templates', value: 'selectParentTemplates' },
	],
	jsonWriteKeys: ['groupLinks', 'groupPrototypes', 'templates'],
	writeFields: [
		{ displayName: 'Host', name: 'host', type: 'string', default: '', description: 'Technical name with an LLD macro (required on create)' },
		{ displayName: 'LLD Rule ID', name: 'ruleid', type: 'string', default: '', description: 'LLD rule the prototype belongs to (required on create)' },
		{ displayName: 'Group Links (JSON)', name: 'groupLinks', type: 'json', default: '', description: 'Array of host group link objects (required on create)' },
	],
});

export const description = resourceModule.description;
export const handlers = resourceModule.handlers;
