import { createCrudResource } from '../../helpers/resourceFactory';

const resourceModule = createCrudResource({
	resource: 'map',
	displayName: 'Map',
	apiObject: 'map',
	idField: 'sysmapid',
	selects: [
		{ name: 'Links', value: 'selectLinks' },
		{ name: 'Selements', value: 'selectSelements' },
		{ name: 'Users', value: 'selectUsers' },
	],
	jsonWriteKeys: ['selements', 'links', 'urls', 'users', 'userGroups'],
	writeFields: [
		{ displayName: 'Name', name: 'name', type: 'string', default: '', description: 'Name of the map (required on create)' },
		{ displayName: 'Width', name: 'width', type: 'number', default: 600, description: 'Width of the map in pixels (required on create)' },
		{ displayName: 'Height', name: 'height', type: 'number', default: 400, description: 'Height of the map in pixels (required on create)' },
		{ displayName: 'Selements (JSON)', name: 'selements', type: 'json', default: '', description: 'Array of map element objects' },
		{ displayName: 'Links (JSON)', name: 'links', type: 'json', default: '', description: 'Array of map link objects' },
	],
});

export const description = resourceModule.description;
export const handlers = resourceModule.handlers;
