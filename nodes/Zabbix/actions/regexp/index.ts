import { createCrudResource } from '../../helpers/resourceFactory';

const resourceModule = createCrudResource({
	resource: 'regexp',
	displayName: 'Regular Expression',
	apiObject: 'regexp',
	idField: 'regexpid',
	jsonWriteKeys: ['expressions'],
	writeFields: [
		{ displayName: 'Name', name: 'name', type: 'string', default: '', description: 'Name of the global regular expression (required on create)' },
		{ displayName: 'Test String', name: 'test_string', type: 'string', default: '', description: 'String used to test the regular expression' },
		{ displayName: 'Expressions (JSON)', name: 'expressions', type: 'json', default: '', description: 'Array of expression objects (required on create)' },
	],
});

export const description = resourceModule.description;
export const handlers = resourceModule.handlers;
