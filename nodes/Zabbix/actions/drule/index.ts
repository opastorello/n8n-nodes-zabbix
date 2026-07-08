import { createCrudResource } from '../../helpers/resourceFactory';

const resourceModule = createCrudResource({
	resource: 'drule',
	displayName: 'Discovery Rule',
	apiObject: 'drule',
	idField: 'druleid',
	selects: [{ name: 'DChecks', value: 'selectDChecks' }],
	jsonWriteKeys: ['dchecks'],
	writeFields: [
		{ displayName: 'Name', name: 'name', type: 'string', default: '', description: 'Name of the network discovery rule (required on create)' },
		{ displayName: 'IP Range', name: 'iprange', type: 'string', default: '', placeholder: '192.168.0.1-254', description: 'IP range(s) to scan (required on create)' },
		{ displayName: 'Delay', name: 'delay', type: 'string', default: '', placeholder: '1h', description: 'Execution interval of the rule' },
		{ displayName: 'Proxy ID', name: 'proxyid', type: 'string', default: '', description: 'Proxy that performs the discovery' },
		{
			displayName: 'Status',
			name: 'status',
			type: 'options',
			default: 0,
			description: 'Whether the rule is enabled',
			options: [
				{ name: 'Enabled', value: 0 },
				{ name: 'Disabled', value: 1 },
			],
		},
		{ displayName: 'DChecks (JSON)', name: 'dchecks', type: 'json', default: '', description: 'Array of discovery check objects (required on create)' },
	],
});

export const description = resourceModule.description;
export const handlers = resourceModule.handlers;
