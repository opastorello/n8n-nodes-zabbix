import { createCrudResource } from '../../helpers/resourceFactory';

const resourceModule = createCrudResource({
	resource: 'usergroup',
	displayName: 'User Group',
	apiObject: 'usergroup',
	idField: 'usrgrpid',
	getFilters: [
		{ name: 'userids', displayName: 'User IDs', description: 'Return groups that contain the given users' },
	],
	selects: [
		{ name: 'Users', value: 'selectUsers' },
		{ name: 'Host Group Rights', value: 'selectHostGroupRights' },
		{ name: 'Template Group Rights', value: 'selectTemplateGroupRights' },
	],
	jsonWriteKeys: ['hostgroup_rights', 'templategroup_rights', 'users'],
	writeFields: [
		{ displayName: 'Name', name: 'name', type: 'string', default: '', description: 'Name of the user group (required on create)' },
		{
			displayName: 'Users Status',
			name: 'users_status',
			type: 'options',
			default: 0,
			description: 'Whether the users in the group are enabled',
			options: [
				{ name: 'Enabled', value: 0 },
				{ name: 'Disabled', value: 1 },
			],
		},
		{ displayName: 'Host Group Rights (JSON)', name: 'hostgroup_rights', type: 'json', default: '', description: 'Array of host group permission objects' },
		{ displayName: 'Template Group Rights (JSON)', name: 'templategroup_rights', type: 'json', default: '', description: 'Array of template group permission objects' },
		{ displayName: 'Users (JSON)', name: 'users', type: 'json', default: '', description: 'Array of user references, e.g. <code>[{"userid":"3"}]</code>' },
	],
});

export const description = resourceModule.description;
export const handlers = resourceModule.handlers;
