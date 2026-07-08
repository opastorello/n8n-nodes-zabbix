import { createGetOnlyResource } from '../../helpers/resourceFactory';

const resourceModule = createGetOnlyResource({
	resource: 'dservice',
	displayName: 'Discovered Service',
	apiObject: 'dservice',
	getCommonOpts: { noNameSearch: true },
	idsParam: 'dserviceids',
	getFilters: [
		{ name: 'druleids', displayName: 'Discovery Rule IDs', description: 'Return services discovered by the given rules' },
		{ name: 'dhostids', displayName: 'Discovered Host IDs', description: 'Return services of the given discovered hosts' },
	],
	selects: [{ name: 'Hosts', value: 'selectHosts' }],
});

export const description = resourceModule.description;
export const handlers = resourceModule.handlers;
