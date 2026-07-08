import { createConfigResource } from '../../helpers/resourceFactory';

const resourceModule = createConfigResource({
	resource: 'settings',
	displayName: 'Settings',
	apiObject: 'settings',
});

export const description = resourceModule.description;
export const handlers = resourceModule.handlers;
