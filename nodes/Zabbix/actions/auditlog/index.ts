import { createGetOnlyResource } from '../../helpers/resourceFactory';

const resourceModule = createGetOnlyResource({
	resource: 'auditlog',
	displayName: 'Audit Log',
	apiObject: 'auditlog',
	getCommonOpts: { noNameSearch: true },
	idsParam: 'auditids',
	getFilters: [
		{ name: 'userids', displayName: 'User IDs', description: 'Return audit records for the given users' },
	],
});

export const description = resourceModule.description;
export const handlers = resourceModule.handlers;
