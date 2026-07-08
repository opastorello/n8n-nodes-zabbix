import { createGetOnlyResource } from '../../helpers/resourceFactory';

const resourceModule = createGetOnlyResource({
	resource: 'dcheck',
	displayName: 'Discovery Check',
	apiObject: 'dcheck',
	getCommonOpts: { noNameSearch: true },
	idsParam: 'dcheckids',
	getFilters: [
		{ name: 'druleids', displayName: 'Discovery Rule IDs', description: 'Return checks of the given discovery rules' },
	],
});

export const description = resourceModule.description;
export const handlers = resourceModule.handlers;
