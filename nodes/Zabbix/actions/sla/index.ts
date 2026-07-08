import { createCrudResource } from '../../helpers/resourceFactory';

const resourceModule = createCrudResource({
	resource: 'sla',
	displayName: 'SLA',
	apiObject: 'sla',
	idField: 'slaid',
	selects: [
		{ name: 'Excluded Downtimes', value: 'selectExcludedDowntimes' },
		{ name: 'Schedule', value: 'selectSchedule' },
		{ name: 'Service Tags', value: 'selectServiceTags' },
	],
	extraOps: [
		{ name: 'Get SLI', value: 'getSli', action: 'Get SLA compliance data', method: 'sla.getsli', placeholder: '{ "slaid": "1", "period_from": 1700000000, "period_to": 1700600000, "serviceids": ["5"] }', description: 'Return the SLI (service level indicator) data for an SLA' },
	],
	jsonWriteKeys: ['service_tags', 'schedule', 'excluded_downtimes'],
	writeFields: [
		{ displayName: 'Name', name: 'name', type: 'string', default: '', description: 'Name of the SLA (required on create)' },
		{ displayName: 'Time Zone', name: 'timezone', type: 'string', default: '', placeholder: 'UTC', description: 'Time zone used for reporting periods (required on create), e.g. UTC or America/Sao_Paulo' },
		{
			displayName: 'Period',
			name: 'period',
			type: 'options',
			default: 0,
			description: 'Reporting period of the SLA (required on create)',
			options: [
				{ name: 'Daily', value: 0, description: 'One reporting period per day' },
				{ name: 'Weekly', value: 1, description: 'One reporting period per week' },
				{ name: 'Monthly', value: 2, description: 'One reporting period per month' },
				{ name: 'Quarterly', value: 3 },
				{ name: 'Annually', value: 4 },
			],
		},
		{ displayName: 'SLO', name: 'slo', type: 'string', default: '', placeholder: '99.9', description: 'Minimum acceptable SLA in percent (required on create)' },
		{ displayName: 'Effective Date', name: 'effective_date', type: 'number', default: 0, description: 'Unix timestamp the SLA takes effect (required on create)' },
		{ displayName: 'Service Tags (JSON)', name: 'service_tags', type: 'json', default: '', description: 'Array of service tag objects (required on create)' },
	],
});

export const description = resourceModule.description;
export const handlers = resourceModule.handlers;
