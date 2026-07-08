import { createCrudResource } from '../../helpers/resourceFactory';

const resourceModule = createCrudResource({
	resource: 'token',
	displayName: 'Token',
	apiObject: 'token',
	idField: 'tokenid',
	getFilters: [
		{ name: 'userids', displayName: 'User IDs', description: 'Return tokens belonging to the given users' },
	],
	extraOps: [
		{ name: 'Generate', value: 'generate', action: 'Generate token strings', method: 'token.generate', placeholder: '{ "tokenids": ["1","2"] }', description: 'Generate the authentication strings for the given tokens' },
	],
	writeFields: [
		{ displayName: 'Name', name: 'name', type: 'string', default: '', description: 'Name of the token (required on create)' },
		{ displayName: 'User ID', name: 'userid', type: 'string', default: '', description: 'User the token belongs to (defaults to the current user)' },
		{ displayName: 'Description', name: 'description', type: 'string', default: '', description: 'Description of the token' },
		{ displayName: 'Expires At', name: 'expires_at', type: 'number', default: 0, description: 'Unix timestamp when the token expires (0 = never)' },
		{
			displayName: 'Status',
			name: 'status',
			type: 'options',
			default: 0,
			description: 'Whether the token is enabled',
			options: [
				{ name: 'Enabled', value: 0 },
				{ name: 'Disabled', value: 1 },
			],
		},
	],
});

export const description = resourceModule.description;
export const handlers = resourceModule.handlers;
