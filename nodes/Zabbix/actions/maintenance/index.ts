import type { IDataObject } from 'n8n-workflow';

import { createCrudResource, tagsField, unwrapFixedCollection } from '../../helpers/resourceFactory';
import { parseJsonParameter } from '../../helpers/utils';

/** Convert an n8n dateTime value (ISO string) to the Unix epoch seconds Zabbix expects. */
function toEpochSeconds(value: unknown): number | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	if (typeof value === 'number') return value;
	const ms = Date.parse(String(value));
	return Number.isNaN(ms) ? undefined : Math.floor(ms / 1000);
}

const resourceModule = createCrudResource({
	resource: 'maintenance',
	displayName: 'Maintenance',
	apiObject: 'maintenance',
	idField: 'maintenanceid',
	getFilters: [
		{ name: 'groupids', displayName: 'Group IDs', description: 'Return maintenances for the given host groups' },
		{ name: 'hostids', displayName: 'Host IDs', description: 'Return maintenances for the given hosts' },
	],
	selects: [
		{ name: 'Host Groups', value: 'selectHostGroups' },
		{ name: 'Hosts', value: 'selectHosts' },
		{ name: 'Tags', value: 'selectTags' },
		{ name: 'Time Periods', value: 'selectTimeperiods' },
	],
	relationWriteKeys: [
		{ name: 'groups', key: 'groupid' },
		{ name: 'hosts', key: 'hostid' },
	],
	writeFields: [
		{
			displayName: 'Name',
			name: 'name',
			type: 'string',
			default: '',
			placeholder: 'e.g. Monthly patching window',
			description: 'Name of the maintenance (required on create)',
		},
		{
			displayName: 'Active Since',
			name: 'active_since',
			type: 'dateTime',
			default: '',
			description: 'When the maintenance becomes active (required on create)',
		},
		{
			displayName: 'Active Till',
			name: 'active_till',
			type: 'dateTime',
			default: '',
			description: 'When the maintenance stops being active (required on create)',
		},
		{
			displayName: 'Host Group Names or IDs',
			name: 'groups',
			type: 'multiOptions',
			typeOptions: { loadOptionsMethod: 'getHostGroups' },
			default: [],
			description:
				'Host groups covered by the maintenance. At least one group or host is required on create. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		},
		{
			displayName: 'Host Names or IDs',
			name: 'hosts',
			type: 'multiOptions',
			typeOptions: { loadOptionsMethod: 'getHosts' },
			default: [],
			description:
				'Hosts covered by the maintenance. At least one group or host is required on create. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		},
		{
			displayName: 'Time Periods',
			name: 'timeperiods',
			type: 'fixedCollection',
			typeOptions: { multipleValues: true },
			placeholder: 'Add Time Period',
			default: {},
			description:
				'When, inside the active window, the maintenance actually applies (required on create). A single one-time period covering the whole window is the most common setup.',
			options: [
				{
					name: 'periodItems',
					displayName: 'Time Period',
					values: [
						{
							displayName: 'Duration (Seconds)',
							name: 'period',
							type: 'number',
							default: 3600,
							description: 'How long the period lasts, in seconds (3600 = 1 hour)',
						},
						{
							displayName: 'Recurrence (JSON)',
							name: 'recurrence',
							type: 'json',
							default: '',
							placeholder: '{ "start_time": 64800, "every": 1, "dayofweek": 64 }',
							description:
								'Recurring-schedule settings (start_time, every, dayofweek, day…) as in the Zabbix time period object',
							displayOptions: { show: { timeperiod_type: [2, 3, 4] } },
						},
						{
							displayName: 'Start Date',
							name: 'start_date',
							type: 'dateTime',
							default: '',
							description: 'When this one-time period starts',
							displayOptions: { show: { timeperiod_type: [0] } },
						},
						{
							displayName: 'Type',
							name: 'timeperiod_type',
							type: 'options',
							default: 0,
							description: 'How the period repeats',
							options: [
								{ name: 'One Time Only', value: 0, description: 'A single fixed window' },
								{ name: 'Daily', value: 2, description: 'Repeats every N days' },
								{ name: 'Weekly', value: 3, description: 'Repeats on selected weekdays' },
								{ name: 'Monthly', value: 4, description: 'Repeats on selected months/days' },
							],
						},
					],
				},
			],
		},
		{
			displayName: 'Maintenance Type',
			name: 'maintenance_type',
			type: 'options',
			default: 0,
			description: 'Whether data keeps being collected during the maintenance',
			options: [
				{ name: 'With Data Collection', value: 0, description: 'Alerts are suppressed but metrics keep flowing' },
				{ name: 'Without Data Collection', value: 1, description: 'Data collection is paused entirely' },
			],
		},
		tagsField('maintenance (problems must match these tags to be suppressed)'),
	],
	transformWriteBody(body: IDataObject, itemIndex: number): IDataObject {
		// Don't send empty group/host arrays — Zabbix rejects them on update.
		if (Array.isArray(body.groups) && body.groups.length === 0) delete body.groups;
		if (Array.isArray(body.hosts) && body.hosts.length === 0) delete body.hosts;

		// dateTime pickers → epoch seconds.
		const since = toEpochSeconds(body.active_since);
		if (since !== undefined) body.active_since = since;
		const till = toEpochSeconds(body.active_till);
		if (till !== undefined) body.active_till = till;

		// Time periods fixedCollection → Zabbix timeperiod objects.
		if (body.timeperiods !== undefined) {
			const items = unwrapFixedCollection(body.timeperiods, 'periodItems');
			if (Array.isArray(items) && items.length > 0) {
				body.timeperiods = (items as IDataObject[]).map((period) => {
					const mapped: IDataObject = {
						timeperiod_type: period.timeperiod_type ?? 0,
						period: period.period ?? 3600,
					};
					const start = toEpochSeconds(period.start_date);
					if (start !== undefined) mapped.start_date = start;
					if (period.recurrence !== undefined && period.recurrence !== '') {
						Object.assign(
							mapped,
							parseJsonParameter.call(this, period.recurrence, 'Recurrence (JSON)', itemIndex),
						);
					}
					return mapped;
				});
			} else {
				delete body.timeperiods;
			}
		}
		return body;
	},
});

export const description = resourceModule.description;
export const handlers = resourceModule.handlers;
