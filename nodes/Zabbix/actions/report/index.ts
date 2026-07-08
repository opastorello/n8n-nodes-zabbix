import { createCrudResource } from '../../helpers/resourceFactory';

const resourceModule = createCrudResource({
	resource: 'report',
	displayName: 'Scheduled Report',
	apiObject: 'report',
	idField: 'reportid',
	selects: [
		{ name: 'Users', value: 'selectUsers' },
		{ name: 'User Groups', value: 'selectUserGroups' },
	],
	jsonWriteKeys: ['users', 'user_groups'],
	writeFields: [
		{ displayName: 'Name', name: 'name', type: 'string', default: '', description: 'Name of the scheduled report (required on create)' },
		{ displayName: 'Dashboard ID', name: 'dashboardid', type: 'string', default: '', description: 'Dashboard the report is generated from (required on create)' },
		{ displayName: 'User ID', name: 'userid', type: 'string', default: '', description: 'User on whose behalf the report is generated (required on create)' },
		{
			displayName: 'Period',
			name: 'period',
			type: 'options',
			default: 0,
			description: 'Reporting period of the report',
			options: [
				{ name: 'Previous Day', value: 0 },
				{ name: 'Previous Week', value: 1 },
				{ name: 'Previous Month', value: 2 },
				{ name: 'Previous Year', value: 3 },
			],
		},
		{ displayName: 'Users (JSON)', name: 'users', type: 'json', default: '', description: 'Array of report recipient user objects' },
	],
});

export const description = resourceModule.description;
export const handlers = resourceModule.handlers;
