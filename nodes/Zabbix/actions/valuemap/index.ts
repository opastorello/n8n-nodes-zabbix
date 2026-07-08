import { createCrudResource } from '../../helpers/resourceFactory';

const resourceModule = createCrudResource({
	resource: 'valuemap',
	displayName: 'Value Map',
	apiObject: 'valuemap',
	idField: 'valuemapid',
	getFilters: [
		{ name: 'hostids', displayName: 'Host IDs', description: 'Return value maps of the given hosts' },
	],
	jsonWriteKeys: ['mappings'],
	writeFields: [
		{
			displayName: 'Host ID',
			name: 'hostid',
			type: 'string',
			default: '',
			description: 'ID of the host or template the value map belongs to (required on create)',
		},
		{
			displayName: 'Name',
			name: 'name',
			type: 'string',
			default: '',
			description: 'Name of the value map (required on create)',
		},
		{
			displayName: 'Mappings (JSON)',
			name: 'mappings',
			type: 'json',
			default: '',
			description:
				'Array of mappings (required on create), e.g. <code>[{"type":0,"value":"1","newvalue":"Up"}]</code>',
		},
	],
});

export const description = resourceModule.description;
export const handlers = resourceModule.handlers;
