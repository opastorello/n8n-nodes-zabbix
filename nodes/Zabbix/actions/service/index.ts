import { createCrudResource } from '../../helpers/resourceFactory';

const resourceModule = createCrudResource({
	resource: 'service',
	displayName: 'Service',
	apiObject: 'service',
	idField: 'serviceid',
	selects: [
		{ name: 'Children', value: 'selectChildren' },
		{ name: 'Parents', value: 'selectParents' },
		{ name: 'Problem Tags', value: 'selectProblemTags' },
		{ name: 'Tags', value: 'selectTags' },
	],
	jsonWriteKeys: ['tags', 'problem_tags', 'parents', 'children'],
	writeFields: [
		{ displayName: 'Name', name: 'name', type: 'string', default: '', description: 'Name of the service (required on create)' },
		{
			displayName: 'Algorithm',
			name: 'algorithm',
			type: 'options',
			default: 1,
			description: 'Status calculation rule for the service',
			options: [
				{ name: 'Set OK', value: 0 },
				{ name: 'Most Critical of Child Services', value: 1 },
				{ name: 'Most Critical if All Children Have Problems', value: 2 },
			],
		},
		{ displayName: 'Sort Order', name: 'sortorder', type: 'number', default: 0, description: 'Position of the service (0–999)' },
		{ displayName: 'Problem Tags (JSON)', name: 'problem_tags', type: 'json', default: '', description: 'Array of problem tag objects mapping problems to this service' },
	],
});

export const description = resourceModule.description;
export const handlers = resourceModule.handlers;
