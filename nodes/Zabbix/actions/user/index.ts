import { createCrudResource } from '../../helpers/resourceFactory';

const resourceModule = createCrudResource({
	resource: 'user',
	displayName: 'User',
	apiObject: 'user',
	idField: 'userid',
	getFilters: [
		{ name: 'usrgrpids', displayName: 'User Group IDs', description: 'Return users in the given user groups' },
		{ name: 'roleids', displayName: 'Role IDs', description: 'Return users with the given roles' },
	],
	selects: [
		{ name: 'Medias', value: 'selectMedias' },
		{ name: 'Role', value: 'selectRole' },
		{ name: 'User Groups', value: 'selectUsrgrps' },
	],
	extraOps: [
		{ name: 'Logout', value: 'logout', action: 'Log out the current user', method: 'user.logout', payload: 'none', description: 'Logs out the API session of the current user' },
		{ name: 'Unblock', value: 'unblock', action: 'Unblock users', method: 'user.unblock', placeholder: '{ "userids": ["3","4"] }', description: 'Unblock users blocked after failed login attempts' },
		{ name: 'Provision', value: 'provision', action: 'Provision users', method: 'user.provision', placeholder: '{ "userids": ["3"] }', description: 'Provision users from the configured user directory' },
		{ name: 'Reset TOTP', value: 'resettotp', action: 'Reset user TOTP secrets', method: 'user.resettotp', placeholder: '{ "userids": ["3"] }', description: 'Reset the TOTP (MFA) secrets of the given users' },
	],
	jsonWriteKeys: ['usrgrps', 'medias'],
	writeFields: [
		{ displayName: 'Username', name: 'username', type: 'string', default: '', description: 'Login name of the user (required on create)' },
		{ displayName: 'Password', name: 'passwd', type: 'string', typeOptions: { password: true }, default: '', description: 'User password (for internal authentication)' },
		{ displayName: 'Name', name: 'name', type: 'string', default: '', description: 'First name of the user' },
		{ displayName: 'Surname', name: 'surname', type: 'string', default: '', description: 'Last name of the user' },
		{ displayName: 'Role ID', name: 'roleid', type: 'string', default: '', description: 'ID of the user role (required on create)' },
		{ displayName: 'User Groups (JSON)', name: 'usrgrps', type: 'json', default: '', description: 'Array of user group references, e.g. <code>[{"usrgrpid":"7"}]</code> (required on create)' },
		{ displayName: 'Medias (JSON)', name: 'medias', type: 'json', default: '', description: 'Array of media (notification) objects for the user' },
	],
});

export const description = resourceModule.description;
export const handlers = resourceModule.handlers;
