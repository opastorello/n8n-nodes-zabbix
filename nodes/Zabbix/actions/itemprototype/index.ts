import { createCrudResource } from '../../helpers/resourceFactory';

const resourceModule = createCrudResource({
	resource: 'itemprototype',
	displayName: 'Item Prototype',
	apiObject: 'itemprototype',
	idField: 'itemid',
	getFilters: [
		{ name: 'discoveryids', displayName: 'LLD Rule IDs', description: 'Return item prototypes of the given LLD rules' },
		{ name: 'hostids', displayName: 'Host IDs', description: 'Return item prototypes of the given hosts' },
	],
	selects: [
		{ name: 'Discovery Rule', value: 'selectDiscoveryRule' },
		{ name: 'Preprocessing', value: 'selectPreprocessing' },
		{ name: 'Tags', value: 'selectTags' },
	],
	jsonWriteKeys: ['tags', 'preprocessing'],
	writeFields: [
		{ displayName: 'Name', name: 'name', type: 'string', default: '', description: 'Name of the item prototype (required on create)' },
		{ displayName: 'Key', name: 'key_', type: 'string', default: '', description: 'Item prototype key with an LLD macro (required on create)' },
		{ displayName: 'Host ID', name: 'hostid', type: 'string', default: '', description: 'Host the prototype belongs to (required on create)' },
		{ displayName: 'LLD Rule ID', name: 'ruleid', type: 'string', default: '', description: 'LLD rule the prototype belongs to (required on create)' },
		{ displayName: 'Type', name: 'type', type: 'number', default: 0, description: 'Item type (same codes as Item type)' },
		{ displayName: 'Value Type', name: 'value_type', type: 'number', default: 3, description: 'Value type (same codes as Item value type)' },
		{ displayName: 'Update Interval', name: 'delay', type: 'string', default: '', description: 'Update interval of the prototype' },
	],
});

export const description = resourceModule.description;
export const handlers = resourceModule.handlers;
