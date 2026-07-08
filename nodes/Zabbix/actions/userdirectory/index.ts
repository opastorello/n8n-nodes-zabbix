import { createCrudResource } from '../../helpers/resourceFactory';

const resourceModule = createCrudResource({
	resource: 'userdirectory',
	displayName: 'User Directory',
	apiObject: 'userdirectory',
	idField: 'userdirectoryid',
	selects: [
		{ name: 'Provision Groups', value: 'selectProvisionGroups' },
		{ name: 'Provision Media', value: 'selectProvisionMedia' },
		{ name: 'Usrgrps', value: 'selectUsrgrps' },
	],
	extraOps: [
		{ name: 'Test', value: 'test', action: 'Test a user directory', method: 'userdirectory.test', placeholder: '{ "userdirectoryid": "1", "test_username": "user", "test_password": "pass" }' },
	],
	writeFields: [
		{ displayName: 'Name', name: 'name', type: 'string', default: '', description: 'Name of the user directory (required on create)' },
		{
			displayName: 'IdP Type',
			name: 'idp_type',
			type: 'options',
			default: 1,
			description: 'Identity provider type',
			options: [
				{ name: 'LDAP', value: 1 },
				{ name: 'SAML', value: 2 },
			],
		},
		{ displayName: 'Host', name: 'host', type: 'string', default: '', description: 'LDAP server host (LDAP directories)' },
		{ displayName: 'Port', name: 'port', type: 'number', default: 389, description: 'LDAP server port (LDAP directories)' },
		{ displayName: 'Base DN', name: 'base_dn', type: 'string', default: '', description: 'LDAP base distinguished name (LDAP directories)' },
		{ displayName: 'Search Attribute', name: 'search_attribute', type: 'string', default: '', description: 'LDAP attribute used to search the user (LDAP directories)' },
	],
});

export const description = resourceModule.description;
export const handlers = resourceModule.handlers;
