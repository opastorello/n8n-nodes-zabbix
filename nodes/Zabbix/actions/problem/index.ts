import type { IDataObject, IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';

import {
	SEVERITY_OPTIONS,
	asRows,
	attachHosts,
	enrichEvent,
	localTime,
	parseSeverity,
	severitiesFrom,
	severityName,
	simplifyEvent,
} from '../../helpers/eventFormat';
import { createGetOnlyResource } from '../../helpers/resourceFactory';
import { wrapZabbixResult } from '../../helpers/utils';
import { zabbixApiRequest, zabbixBaseUrl } from '../../transport';

const resource = 'problem';

const filterFields: INodeProperties[] = [
	{
		displayName: 'Minimum Severity',
		name: 'minSeverity',
		type: 'options',
		default: 0,
		description: 'Only return problems at or above this severity',
		options: SEVERITY_OPTIONS,
	},
	{
		displayName: 'Acknowledged',
		name: 'ackFilter',
		type: 'options',
		default: 'any',
		options: [
			{ name: 'Any', value: 'any' },
			{ name: 'Only Acknowledged', value: 'yes' },
			{ name: 'Only Unacknowledged', value: 'no' },
		],
	},
	{
		displayName: 'Suppressed',
		name: 'suppressedFilter',
		type: 'options',
		default: 'any',
		description: 'Suppressed problems are the ones hidden by a maintenance or a manual suppression',
		options: [
			{ name: 'Any', value: 'any' },
			{ name: 'Only Suppressed', value: 'yes' },
			{ name: 'Only Not Suppressed', value: 'no' },
		],
	},
	{
		displayName: 'Include Recently Resolved',
		name: 'recent',
		type: 'boolean',
		default: false,
		description:
			'Whether to also return problems resolved in the last few minutes (Zabbix "recent" — set by "Display OK triggers for" in the frontend settings)',
	},
	{
		displayName: 'Simplify',
		name: 'simplify',
		type: 'boolean',
		default: false,
		description:
			'Whether to return only the fields an alert or AI agent needs: name, severity, host, since, duration, acknowledged, tags and link',
	},
];

const resourceModule = createGetOnlyResource({
	resource,
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
	extraFields: filterFields,
	extendParams(i, params) {
		const severities = severitiesFrom(parseSeverity(this.getNodeParameter('minSeverity', i, 0)));
		if (severities.length) params.severities = severities;
		const ack = this.getNodeParameter('ackFilter', i, 'any') as string;
		if (ack !== 'any') params.acknowledged = ack === 'yes';
		const suppressed = this.getNodeParameter('suppressedFilter', i, 'any') as string;
		if (suppressed !== 'any') params.suppressed = suppressed === 'yes';
		if (this.getNodeParameter('recent', i, false)) params.recent = true;
		if (this.getNodeParameter('simplify', i, false)) params.selectTags = 'extend';
	},
	async transformResult(i, result) {
		if (!Array.isArray(result) || !result.length || typeof result[0] !== 'object') return result;
		const rows = result as IDataObject[];
		await attachHosts.call(this, rows);
		const baseUrl = zabbixBaseUrl(String((await this.getCredentials('zabbixTokenApi')).url));
		const enriched = rows.map((row) => enrichEvent(row, baseUrl, this.getTimezone()));
		return this.getNodeParameter('simplify', i, false) ? enriched.map(simplifyEvent) : enriched;
	},
});

const contextFields: INodeProperties[] = [
	{
		displayName: 'Event ID',
		name: 'contextEventId',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. 9001',
		description: 'Event ID of the problem (the <code>eventid</code> from the trigger, a Get Many or an alert)',
		displayOptions: { show: { resource: [resource], operation: ['getContext'] } },
	},
];

const operationSelect = resourceModule.description.find((p) => p.name === 'operation') as INodeProperties;
operationSelect.options = [
	{
		name: 'Get Context',
		value: 'getContext',
		action: 'Get the full context of a problem',
		description:
			'Everything needed to triage one problem in a single result: trigger, host, maintenance, item values, recurrence and recent events',
	},
	...(operationSelect.options ?? []),
];

export const description: INodeProperties[] = [...resourceModule.description, ...contextFields];

export const handlers = {
	...resourceModule.handlers,

	async getContext(this: IExecuteFunctions, i: number): Promise<INodeExecutionData[]> {
		const eventid = String(this.getNodeParameter('contextEventId', i)).trim();
		const context = await problemContext.call(this, eventid);
		return wrapZabbixResult(context, i);
	},
};

const DAY = 86400;

/** Gather everything about one problem event. Missing pieces become null instead of failing. */
export async function problemContext(this: IExecuteFunctions, eventid: string): Promise<IDataObject> {
	const now = Math.floor(Date.now() / 1000);
	const baseUrl = zabbixBaseUrl(String((await this.getCredentials('zabbixTokenApi')).url));
	const timeZone = this.getTimezone();

	const [event] = asRows(await zabbixApiRequest.call(this, 'event.get', {
		eventids: [eventid],
		output: 'extend',
		selectHosts: ['hostid', 'host', 'name'],
		selectTags: 'extend',
		selectAcknowledges: ['clock', 'message', 'action', 'userid'],
		selectSuppressionData: 'extend',
	}));
	if (!event) return { eventid, found: false, error: `No event ${eventid} — check the ID and the API user's permissions` };

	const triggerid = String(event.objectid);
	const isTrigger = String(event.source) === '0' && String(event.object) === '0';
	const hostid = String(((event.hosts as IDataObject[]) ?? [])[0]?.hostid ?? '');

	const [trigger] = isTrigger
		? asRows(await zabbixApiRequest.call(this, 'trigger.get', {
				triggerids: [triggerid],
				output: ['triggerid', 'description', 'expression', 'recovery_expression', 'priority', 'comments', 'manual_close', 'status', 'value', 'lastchange', 'url'],
				expandDescription: true,
				expandExpression: true,
				selectItems: ['itemid', 'name', 'key_', 'value_type', 'units', 'lastvalue', 'lastclock', 'state', 'error'],
				selectDependencies: ['triggerid', 'description', 'value', 'priority'],
			}))
		: [];

	const [host] = hostid
		? asRows(await zabbixApiRequest.call(this, 'host.get', {
				hostids: [hostid],
				output: 'extend',
				selectHostGroups: ['groupid', 'name'],
				selectInterfaces: ['type', 'ip', 'dns', 'port', 'available', 'error'],
				selectTags: 'extend',
				selectInventory: 'extend',
			}))
		: [];

	let maintenance: IDataObject | null = null;
	if (host && String(host.maintenance_status) === '1' && host.maintenanceid && host.maintenanceid !== '0') {
		const [m] = asRows(await zabbixApiRequest.call(this, 'maintenance.get', {
			maintenanceids: [host.maintenanceid],
			output: ['maintenanceid', 'name', 'description', 'active_since', 'active_till', 'maintenance_type'],
		}));
		maintenance = m
			? {
					...m,
					with_data_collection: String(m.maintenance_type) === '0',
					active_since_local: localTime(m.active_since, timeZone),
					active_till_local: localTime(m.active_till, timeZone),
				}
			: null;
	}

	let recurrence: IDataObject | null = null;
	if (isTrigger) {
		const count = async (seconds: number) =>
			Number(
				await zabbixApiRequest.call(this, 'event.get', {
					objectids: [triggerid],
					source: 0,
					object: 0,
					value: 1,
					time_from: now - seconds,
					countOutput: true,
				}),
			);
		const last24h = await count(DAY);
		const last7d = await count(7 * DAY);
		const verdict = last24h >= 3 || last7d >= 5 ? 'chronic' : last7d <= 1 ? 'new' : 'recurring';
		recurrence = { last_24h: last24h, last_7d: last7d, verdict };
	}

	const recentEvents = hostid
		? asRows(await zabbixApiRequest.call(this, 'event.get', {
				hostids: [hostid],
				source: 0,
				object: 0,
				value: 1,
				time_from: now - DAY,
				output: ['eventid', 'name', 'severity', 'clock', 'r_eventid'],
				sortfield: ['eventid'],
				sortorder: 'DESC',
				limit: 10,
			})).map((e) => ({
				eventid: e.eventid,
				name: e.name,
				severity_name: severityName(e.severity),
				since_local: enrichEvent(e, baseUrl, timeZone).since_local,
				resolved: String(e.r_eventid) !== '0',
			}))
		: [];

	const enriched = enrichEvent(event, baseUrl, timeZone);
	const interfaces = ((host?.interfaces as IDataObject[]) ?? []).map((iface) => ({
		...iface,
		available_name: ['unknown', 'available', 'unavailable'][Number(iface.available)] ?? String(iface.available),
	}));
	const inventory = Object.fromEntries(
		Object.entries((host?.inventory as IDataObject) ?? {}).filter(([, v]) => v !== '' && v !== '0' && v !== null),
	);

	return {
		eventid,
		found: true,
		summary: `${String(enriched.severity_name)}: ${String(event.name)} on ${String(host?.name ?? host?.host ?? 'unknown host')}`,
		problem: simplifyEvent(enriched),
		trigger: trigger
			? {
					triggerid: trigger.triggerid,
					description: trigger.description,
					expression: trigger.expression,
					recovery_expression: trigger.recovery_expression,
					severity_name: severityName(trigger.priority),
					comments: trigger.comments,
					manual_close_allowed: String(trigger.manual_close) === '1',
					enabled: String(trigger.status) === '0',
					url: trigger.url,
					items: trigger.items,
					dependencies: trigger.dependencies,
				}
			: null,
		host: host
			? {
					hostid: host.hostid,
					host: host.host,
					name: host.name,
					enabled: String(host.status) === '0',
					groups: host.hostgroups,
					interfaces,
					tags: host.tags,
					inventory,
					proxyid: host.proxyid ?? host.proxy_hostid,
				}
			: null,
		in_maintenance: maintenance !== null,
		maintenance,
		recurrence,
		acknowledges: event.acknowledges,
		recent_host_events_24h: recentEvents,
		url: enriched.event_url,
	};
}
