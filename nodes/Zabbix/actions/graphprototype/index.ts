import { createCrudResource } from '../../helpers/resourceFactory';

const resourceModule = createCrudResource({
	resource: 'graphprototype',
	displayName: 'Graph Prototype',
	apiObject: 'graphprototype',
	idField: 'graphid',
	getFilters: [
		{ name: 'discoveryids', displayName: 'LLD Rule IDs', description: 'Return graph prototypes of the given LLD rules' },
		{ name: 'hostids', displayName: 'Host IDs', description: 'Return graph prototypes of the given hosts' },
	],
	selects: [
		{ name: 'Graph Items', value: 'selectGraphItems' },
		{ name: 'Discovery Rule', value: 'selectDiscoveryRule' },
	],
	jsonWriteKeys: ['gitems'],
	writeFields: [
		{ displayName: 'Name', name: 'name', type: 'string', default: '', description: 'Name of the graph prototype (required on create)' },
		{ displayName: 'Width', name: 'width', type: 'number', default: 900, description: 'Width in pixels (required on create)' },
		{ displayName: 'Height', name: 'height', type: 'number', default: 200, description: 'Height in pixels (required on create)' },
		{ displayName: 'Graph Items (JSON)', name: 'gitems', type: 'json', default: '', description: 'Array of graph item objects with prototypes (required on create)' },
	],
});

export const description = resourceModule.description;
export const handlers = resourceModule.handlers;
