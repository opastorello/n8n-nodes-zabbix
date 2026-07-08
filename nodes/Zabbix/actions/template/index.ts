import { createCrudResource, macrosField, tagsField } from '../../helpers/resourceFactory';

const resourceModule = createCrudResource({
	resource: 'template',
	displayName: 'Template',
	apiObject: 'template',
	idField: 'templateid',
	getFilters: [
		{ name: 'groupids', displayName: 'Group IDs', description: 'Return templates in the given template groups' },
		{ name: 'hostids', displayName: 'Host IDs', description: 'Return templates linked to the given hosts' },
	],
	selects: [
		{ name: 'Groups', value: 'selectTemplateGroups' },
		{ name: 'Hosts', value: 'selectHosts' },
		{ name: 'Items', value: 'selectItems' },
		{ name: 'Linked Templates', value: 'selectParentTemplates' },
		{ name: 'Macros', value: 'selectMacros' },
		{ name: 'Tags', value: 'selectTags' },
		{ name: 'Triggers', value: 'selectTriggers' },
	],
	extraOps: [
		{ name: 'Mass Add', value: 'massAdd', action: 'Mass add templates', method: 'template.massadd', placeholder: '{ "templates": [{"templateid":"10001"}], "groups": [{"groupid":"5"}] }' },
		{ name: 'Mass Remove', value: 'massRemove', action: 'Mass remove templates', method: 'template.massremove', placeholder: '{ "templateids": ["10001"], "groupids": ["5"] }' },
		{ name: 'Mass Update', value: 'massUpdate', action: 'Mass update templates', method: 'template.massupdate', placeholder: '{ "templates": [{"templateid":"10001"}], "groups": [{"groupid":"5"}] }' },
	],
	jsonWriteKeys: ['tags', 'macros'],
	relationWriteKeys: [
		{ name: 'groups', key: 'groupid' },
		{ name: 'templates', key: 'templateid' },
	],
	writeFields: [
		{
			displayName: 'Technical Name',
			name: 'host',
			type: 'string',
			default: '',
			description: 'Technical (unique) name of the template (required on create)',
		},
		{
			displayName: 'Visible Name',
			name: 'name',
			type: 'string',
			default: '',
			description: 'Visible name of the template',
		},
		{
			displayName: 'Group IDs',
			name: 'groups',
			type: 'string',
			default: '',
			placeholder: '10,11',
			description: 'Comma-separated template group IDs (required on create)',
		},
		{
			displayName: 'Linked Template IDs',
			name: 'templates',
			type: 'string',
			default: '',
			description: 'Comma-separated template IDs to link to this template',
		},
		{
			displayName: 'Description',
			name: 'description',
			type: 'string',
			typeOptions: { rows: 3 },
			default: '',
			description: 'Description of the template',
		},
		tagsField('template'),
		macrosField('template'),
	],
});

export const description = resourceModule.description;
export const handlers = resourceModule.handlers;
