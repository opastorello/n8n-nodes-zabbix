import { createCrudResource } from '../../helpers/resourceFactory';

const resourceModule = createCrudResource({
	resource: 'proxygroup',
	displayName: 'Proxy Group',
	apiObject: 'proxygroup',
	idField: 'proxy_groupid',
	selects: [{ name: 'Proxies', value: 'selectProxies' }],
	writeFields: [
		{ displayName: 'Name', name: 'name', type: 'string', default: '', description: 'Name of the proxy group (required on create)' },
		{ displayName: 'Failover Delay', name: 'failover_delay', type: 'string', default: '', placeholder: '1m', description: 'Failover period for the proxies in the group' },
		{ displayName: 'Min Online', name: 'min_online', type: 'string', default: '', description: 'Minimum number of online proxies required for the group to be online' },
		{ displayName: 'Description', name: 'description', type: 'string', default: '', description: 'Description of the proxy group' },
	],
});

export const description = resourceModule.description;
export const handlers = resourceModule.handlers;
