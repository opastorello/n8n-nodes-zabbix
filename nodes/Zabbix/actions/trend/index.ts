import { createGetOnlyResource } from '../../helpers/resourceFactory';

const resourceModule = createGetOnlyResource({
	resource: 'trend',
	displayName: 'Trend',
	apiObject: 'trend',
	getCommonOpts: { minimal: true },
	idsParam: 'itemids',
});

export const description = resourceModule.description;
export const handlers = resourceModule.handlers;
