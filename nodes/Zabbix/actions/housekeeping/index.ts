import { createConfigResource } from '../../helpers/resourceFactory';

const resourceModule = createConfigResource({
	resource: 'housekeeping',
	displayName: 'Housekeeping',
	apiObject: 'housekeeping',
});

export const description = resourceModule.description;
export const handlers = resourceModule.handlers;
