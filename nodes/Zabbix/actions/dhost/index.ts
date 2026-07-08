import { createGetOnlyResource } from '../../helpers/resourceFactory';

const resourceModule = createGetOnlyResource({
	resource: 'dhost',
	displayName: 'Discovered Host',
	apiObject: 'dhost',
	getCommonOpts: { noNameSearch: true },
	idsParam: 'dhostids',
	getFilters: [
		{ name: 'druleids', displayName: 'Discovery Rule IDs', description: 'Return hosts discovered by the given rules' },
	],
	selects: [{ name: 'DServices', value: 'selectDServices' }],
});

export const description = resourceModule.description;
export const handlers = resourceModule.handlers;
