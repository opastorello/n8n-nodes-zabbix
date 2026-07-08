import { createCrudResource } from '../../helpers/resourceFactory';

const resourceModule = createCrudResource({
	resource: 'mfa',
	displayName: 'MFA Method',
	apiObject: 'mfa',
	idField: 'mfaid',
	writeFields: [
		{ displayName: 'Name', name: 'name', type: 'string', default: '', description: 'Name of the MFA method (required on create)' },
		{
			displayName: 'Type',
			name: 'type',
			type: 'options',
			default: 1,
			description: 'Type of the multi-factor authentication method',
			options: [
				{ name: 'TOTP', value: 1 },
				{ name: 'Duo Universal Prompt', value: 2 },
			],
		},
	],
});

export const description = resourceModule.description;
export const handlers = resourceModule.handlers;
