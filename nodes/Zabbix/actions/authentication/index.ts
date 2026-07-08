import { createConfigResource } from '../../helpers/resourceFactory';

const resourceModule = createConfigResource({
	resource: 'authentication',
	displayName: 'Authentication',
	apiObject: 'authentication',
});

export const description = resourceModule.description;
export const handlers = resourceModule.handlers;
