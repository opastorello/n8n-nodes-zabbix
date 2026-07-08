import { createGetOnlyResource } from '../../helpers/resourceFactory';

const resourceModule = createGetOnlyResource({
	resource: 'hanode',
	displayName: 'HA Node',
	apiObject: 'hanode',
	idsParam: 'ha_nodeids',
});

export const description = resourceModule.description;
export const handlers = resourceModule.handlers;
