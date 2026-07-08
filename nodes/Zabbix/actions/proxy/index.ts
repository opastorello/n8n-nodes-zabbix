import { createCrudResource } from '../../helpers/resourceFactory';

const resourceModule = createCrudResource({
	resource: 'proxy',
	displayName: 'Proxy',
	apiObject: 'proxy',
	idField: 'proxyid',
	selects: [
		{ name: 'Hosts', value: 'selectHosts' },
		{ name: 'Proxy Group', value: 'selectProxyGroup' },
	],
	writeFields: [
		{ displayName: 'Name', name: 'name', type: 'string', default: '', description: 'Name of the proxy (required on create)' },
		{
			displayName: 'Operating Mode',
			name: 'operating_mode',
			type: 'options',
			default: 0,
			description: 'Operating mode of the proxy',
			options: [
				{ name: 'Active', value: 0, description: 'Proxy connects to the Zabbix server' },
				{ name: 'Passive', value: 1, description: 'Zabbix server connects to the proxy' },
			],
		},
		{ displayName: 'Address', name: 'address', type: 'string', default: '', description: 'Address for the passive proxy' },
		{ displayName: 'Port', name: 'port', type: 'string', default: '', description: 'Port for the passive proxy' },
	],
});

export const description = resourceModule.description;
export const handlers = resourceModule.handlers;
