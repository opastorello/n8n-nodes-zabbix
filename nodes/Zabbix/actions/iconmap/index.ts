import { createCrudResource } from '../../helpers/resourceFactory';

const resourceModule = createCrudResource({
	resource: 'iconmap',
	displayName: 'Icon Map',
	apiObject: 'iconmap',
	idField: 'iconmapid',
	selects: [{ name: 'Mappings', value: 'selectMappings' }],
	jsonWriteKeys: ['mappings'],
	writeFields: [
		{ displayName: 'Name', name: 'name', type: 'string', default: '', description: 'Name of the icon map (required on create)' },
		{ displayName: 'Default Icon ID', name: 'default_iconid', type: 'string', default: '', description: 'Icon used when no mapping matches (required on create)' },
		{ displayName: 'Mappings (JSON)', name: 'mappings', type: 'json', default: '', description: 'Array of icon mapping objects (required on create)' },
	],
});

export const description = resourceModule.description;
export const handlers = resourceModule.handlers;
