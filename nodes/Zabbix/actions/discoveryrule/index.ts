import { createCrudResource } from '../../helpers/resourceFactory';

// LLD (low-level discovery) rules — object `discoveryrule`, id `itemid`.
const resourceModule = createCrudResource({
	resource: 'discoveryrule',
	displayName: 'LLD Rule',
	apiObject: 'discoveryrule',
	idField: 'itemid',
	getFilters: [
		{ name: 'hostids', displayName: 'Host IDs', description: 'Return LLD rules of the given hosts' },
		{ name: 'templateids', displayName: 'Template IDs', description: 'Return LLD rules of the given templates' },
	],
	selects: [
		{ name: 'Filter', value: 'selectFilter' },
		{ name: 'Hosts', value: 'selectHosts' },
		{ name: 'LLD Macro Paths', value: 'selectLLDMacroPaths' },
		{ name: 'Preprocessing', value: 'selectPreprocessing' },
	],
	jsonWriteKeys: ['filter', 'lld_macro_paths', 'preprocessing'],
	writeFields: [
		{ displayName: 'Name', name: 'name', type: 'string', default: '', description: 'Name of the LLD rule (required on create)' },
		{ displayName: 'Key', name: 'key_', type: 'string', default: '', description: 'LLD rule key (required on create)' },
		{ displayName: 'Host ID', name: 'hostid', type: 'string', default: '', description: 'Host the rule belongs to (required on create)' },
		{
			displayName: 'Type',
			name: 'type',
			type: 'number',
			default: 0,
			description: 'Item type of the LLD rule (same codes as Item type)',
		},
		{ displayName: 'Update Interval', name: 'delay', type: 'string', default: '', placeholder: '1h', description: 'Update interval of the rule' },
		{ displayName: 'Interface ID', name: 'interfaceid', type: 'string', default: '', description: 'Host interface used by the rule' },
	],
});

export const description = resourceModule.description;
export const handlers = resourceModule.handlers;
