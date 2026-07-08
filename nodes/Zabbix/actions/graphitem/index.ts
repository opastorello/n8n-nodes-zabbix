import { createGetOnlyResource } from '../../helpers/resourceFactory';

const resourceModule = createGetOnlyResource({
	resource: 'graphitem',
	displayName: 'Graph Item',
	apiObject: 'graphitem',
	getCommonOpts: { noNameSearch: true },
	idsParam: 'graphids',
	getFilters: [
		{ name: 'itemids', displayName: 'Item IDs', description: 'Return graph items for the given items' },
	],
});

export const description = resourceModule.description;
export const handlers = resourceModule.handlers;
