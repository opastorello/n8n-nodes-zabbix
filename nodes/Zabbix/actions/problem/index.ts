import { createGetOnlyResource } from '../../helpers/resourceFactory';

const resourceModule = createGetOnlyResource({
	resource: 'problem',
	displayName: 'Problem',
	apiObject: 'problem',
	idsParam: 'eventids',
	getFilters: [
		{ name: 'groupids', displayName: 'Group IDs', description: 'Return problems for the given host groups' },
		{ name: 'hostids', displayName: 'Host IDs', description: 'Return problems for the given hosts' },
		{ name: 'objectids', displayName: 'Object IDs', description: 'Return problems for the given objects (e.g. trigger IDs)' },
	],
	selects: [
		{ name: 'Acknowledges', value: 'selectAcknowledges' },
		{ name: 'Suppression Data', value: 'selectSuppressionData' },
		{ name: 'Tags', value: 'selectTags' },
	],
});

export const description = resourceModule.description;
export const handlers = resourceModule.handlers;
