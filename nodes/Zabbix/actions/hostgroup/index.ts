import { createCrudResource } from '../../helpers/resourceFactory';

const resourceModule = createCrudResource({
	resource: 'hostgroup',
	displayName: 'Host Group',
	apiObject: 'hostgroup',
	idField: 'groupid',
	selects: [
		{ name: 'Hosts', value: 'selectHosts' },
		{ name: 'Templates', value: 'selectTemplates' },
	],
	extraOps: [
		{ name: 'Mass Add', value: 'massAdd', action: 'Mass add host groups', method: 'hostgroup.massadd', placeholder: '{ "groups": [{"groupid":"5"}], "hosts": [{"hostid":"10084"}] }' },
		{ name: 'Mass Remove', value: 'massRemove', action: 'Mass remove host groups', method: 'hostgroup.massremove', placeholder: '{ "groupids": ["5"], "hostids": ["10084"] }' },
		{ name: 'Mass Update', value: 'massUpdate', action: 'Mass update host groups', method: 'hostgroup.massupdate', placeholder: '{ "groups": [{"groupid":"5"}], "hosts": [{"hostid":"10084"}] }' },
		{ name: 'Propagate', value: 'propagate', action: 'Propagate host group permissions', method: 'hostgroup.propagate', placeholder: '{ "groups": [{"groupid":"5"}], "permissions": true, "tag_filters": true }' },
	],
	writeFields: [
		{
			displayName: 'Name',
			name: 'name',
			type: 'string',
			default: '',
			description: 'Name of the host group (required on create)',
		},
	],
});

export const description = resourceModule.description;
export const handlers = resourceModule.handlers;
