import { createConfigResource } from '../../helpers/resourceFactory';

const resourceModule = createConfigResource({
	resource: 'autoregistration',
	displayName: 'Auto Registration',
	apiObject: 'autoregistration',
});

export const description = resourceModule.description;
export const handlers = resourceModule.handlers;
