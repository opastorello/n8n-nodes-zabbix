import { createCrudResource } from '../../helpers/resourceFactory';

const resourceModule = createCrudResource({
	resource: 'templategroup',
	displayName: 'Template Group',
	apiObject: 'templategroup',
	idField: 'groupid',
	selects: [{ name: 'Templates', value: 'selectTemplates' }],
	extraOps: [
		{ name: 'Mass Add', value: 'massAdd', action: 'Mass add template groups', method: 'templategroup.massadd', placeholder: '{ "groups": [{"groupid":"5"}], "templates": [{"templateid":"10001"}] }' },
		{ name: 'Mass Remove', value: 'massRemove', action: 'Mass remove template groups', method: 'templategroup.massremove', placeholder: '{ "groupids": ["5"], "templateids": ["10001"] }' },
		{ name: 'Mass Update', value: 'massUpdate', action: 'Mass update template groups', method: 'templategroup.massupdate', placeholder: '{ "groups": [{"groupid":"5"}], "templates": [{"templateid":"10001"}] }' },
		{ name: 'Propagate', value: 'propagate', action: 'Propagate template group permissions', method: 'templategroup.propagate', placeholder: '{ "groups": [{"groupid":"5"}], "permissions": true }' },
	],
	writeFields: [
		{
			displayName: 'Name',
			name: 'name',
			type: 'string',
			default: '',
			description: 'Name of the template group (required on create)',
		},
	],
});

export const description = resourceModule.description;
export const handlers = resourceModule.handlers;
