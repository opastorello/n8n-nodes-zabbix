import { createCrudResource } from '../../helpers/resourceFactory';

const resourceModule = createCrudResource({
	resource: 'graph',
	displayName: 'Graph',
	apiObject: 'graph',
	idField: 'graphid',
	getFilters: [
		{ name: 'hostids', displayName: 'Host IDs', description: 'Return graphs of the given hosts' },
		{ name: 'templateids', displayName: 'Template IDs', description: 'Return graphs of the given templates' },
	],
	selects: [
		{ name: 'Graph Items', value: 'selectGraphItems' },
		{ name: 'Hosts', value: 'selectHosts' },
	],
	jsonWriteKeys: ['gitems'],
	writeFields: [
		{ displayName: 'Name', name: 'name', type: 'string', default: '', description: 'Name of the graph (required on create)' },
		{ displayName: 'Width', name: 'width', type: 'number', default: 900, description: 'Width of the graph in pixels (required on create)' },
		{ displayName: 'Height', name: 'height', type: 'number', default: 200, description: 'Height of the graph in pixels (required on create)' },
		{ displayName: 'Graph Items (JSON)', name: 'gitems', type: 'json', default: '', description: 'Array of graph item objects (required on create)' },
	],
});

export const description = resourceModule.description;
export const handlers = resourceModule.handlers;
