import {
	jsonParse,
	NodeConnectionTypes,
	NodeOperationError,
	type IDataObject,
	type ILoadOptionsFunctions,
	type INodeExecutionData,
	type INodePropertyOptions,
	type INodeType,
	type INodeTypeDescription,
	type IPollFunctions,
} from 'n8n-workflow';

import { zabbixApiRequest, zabbixBaseUrl, zabbixCredentialTest } from './transport';
import { eventUrl, localTime, severityName } from './helpers/eventFormat';
import { loadOptionsMethods } from './methods/loadOptions';

const PAGE_SIZE = 100;
const MAX_PAGES_PER_POLL = 10;


const toBigInt = (id: unknown) => BigInt(String(id ?? '0'));

/**
 * Polling trigger: starts a workflow when Zabbix problems open or resolve (or on
 * any new event). Progress is tracked per node via a watermark on the highest
 * seen event ID, so each event fires exactly once.
 */
export class ZabbixTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Zabbix Trigger',
		name: 'zabbixTrigger',
		icon: { light: 'file:../../icons/zabbix.svg', dark: 'file:../../icons/zabbix.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{"On " + $parameter["event"]}}',
		description: 'Starts the workflow when Zabbix problems open or resolve',
		defaults: {
			name: 'Zabbix Trigger',
		},
		polling: true,
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'zabbixTokenApi',
				required: true,
				testedBy: 'zabbixApiCredentialTest',
			},
		],
		properties: [
			{
				displayName:
					'On the first poll this trigger only records the current position — it does not replay old events. From then on, each new event fires exactly once. "Test workflow" shows the latest matching event.',
				name: 'watermarkNotice',
				type: 'notice',
				default: '',
			},
			{
				displayName: 'Trigger On',
				name: 'event',
				type: 'options',
				default: 'problem',
				description: 'Which Zabbix events should start the workflow',
				options: [
					{
						name: 'New Event (Any Source)',
						value: 'event',
						description:
							'Fire on any new event: trigger, discovery, autoregistration or internal, problem or recovery',
					},
					{
						name: 'New Problem',
						value: 'problem',
						description:
							'Fire when a trigger goes into problem state, even if it resolves before the next poll',
					},
					{
						name: 'Problem Resolved',
						value: 'resolved',
						description:
							'Fire when a problem recovers. The original problem is included under <code>problem</code>.',
					},
				],
			},
			{
				displayName: 'Host Group Names or IDs',
				name: 'groupids',
				type: 'multiOptions',
				typeOptions: { loadOptionsMethod: 'getHostGroups' },
				default: [],
				description:
					'Only fire for events in these host groups (leave empty for all). Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'Host Names or IDs',
				name: 'hostids',
				type: 'multiOptions',
				typeOptions: { loadOptionsMethod: 'getHosts' },
				default: [],
				description:
					'Only fire for events on these hosts (leave empty for all). Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'Minimum Severity',
				name: 'severity',
				type: 'options',
				default: 0,
				description: 'Only fire for problems at or above this severity',
				displayOptions: { show: { event: ['problem', 'resolved'] } },
				options: [
					{ name: 'Average', value: 3, description: 'Fires for Average, High and Disaster problems' },
					{ name: 'Disaster', value: 5, description: 'Fires only for Disaster problems' },
					{ name: 'High', value: 4, description: 'Fires for High and Disaster problems' },
					{ name: 'Information', value: 1, description: 'Fires for everything except Not Classified' },
					{ name: 'Not Classified', value: 0, description: 'Fires for every problem regardless of severity' },
					{ name: 'Warning', value: 2, description: 'Fires for Warning and above' },
				],
			},
			{
				displayName: 'Ignore Suppressed',
				name: 'ignoreSuppressed',
				type: 'boolean',
				default: false,
				description:
					'Whether to skip problems suppressed by a maintenance (hosts in maintenance) or by a manual suppress',
				displayOptions: { show: { event: ['problem', 'resolved'] } },
			},
			{
				displayName: 'Name Matches (Regex)',
				name: 'nameMatches',
				type: 'string',
				default: '',
				placeholder: 'e.g. (?i)link down|unreachable',
				description: 'Only fire when the event name matches this regular expression (leave empty for all)',
			},
			{
				displayName: 'Name Excludes (Regex)',
				name: 'nameExcludes',
				type: 'string',
				default: '',
				placeholder: 'e.g. (?i)ping loss',
				description: 'Skip events whose name matches this regular expression',
			},
			{
				displayName: 'Additional Filters (JSON)',
				name: 'additionalFilters',
				type: 'json',
				default: '{}',
				placeholder: '{ "tags": [{"tag": "env", "value": "prod"}] }',
				hint: 'Any parameter of event.get works here, e.g. tag filters or "suppressed": false',
				description: 'Extra parameters merged into the event.get request',
			},
		],
	};

	methods = {
		loadOptions: loadOptionsMethods as unknown as Record<
			string,
			(this: ILoadOptionsFunctions) => Promise<INodePropertyOptions[]>
		>,
		credentialTest: { zabbixApiCredentialTest: zabbixCredentialTest },
	};

	async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
		const mode = this.getNodeParameter('event', 'problem') as string;
		const minSeverity = this.getNodeParameter('severity', 0) as number;

		const query: IDataObject = {
			output: 'extend',
			selectTags: 'extend',
			selectHosts: ['hostid', 'host', 'name'],
		};
		if (mode === 'problem' || mode === 'resolved') {
			Object.assign(query, {
				source: 0,
				object: 0,
				value: mode === 'problem' ? 1 : 0,
				selectRelatedObject: ['triggerid', 'description', 'priority', 'comments'],
			});
			// Recovery events always carry severity 0, so the resolved mode filters on
			// the trigger's priority client-side instead.
			if (mode === 'problem' && minSeverity > 0) {
				query.severities = Array.from({ length: 6 - minSeverity }, (_, k) => minSeverity + k);
			}
		}

		const groupids = this.getNodeParameter('groupids', []) as string[];
		if (groupids.length) query.groupids = groupids;
		const hostids = this.getNodeParameter('hostids', []) as string[];
		if (hostids.length) query.hostids = hostids;

		if (mode !== 'event' && this.getNodeParameter('ignoreSuppressed', false)) query.suppressed = false;

		Object.assign(query, readFilters.call(this));

		const staticData = this.getWorkflowStaticData('node');

		// Manual "Test workflow": show the latest matching event without moving the watermark.
		if (this.getMode() === 'manual') {
			const latest = (await zabbixApiRequest.call(this, 'event.get', {
				...query,
				sortfield: ['eventid'],
				sortorder: 'DESC',
				limit: 1,
			})) as IDataObject[];
			const items = await enrich.call(this, mode, latest.filter(nameFilter.call(this)));
			return items.length ? [items.map((json) => ({ json }))] : null;
		}

		// First activation: record the current position, don't replay history.
		if (staticData.lastEventId === undefined) {
			const latest = (await zabbixApiRequest.call(this, 'event.get', {
				output: ['eventid'],
				sortfield: ['eventid'],
				sortorder: 'DESC',
				limit: 1,
			})) as IDataObject[];
			staticData.lastEventId = String(latest[0]?.eventid ?? '0');
			return null;
		}

		// Walk forward from the watermark in ascending pages so a burst of events is
		// never truncated; anything beyond the per-poll cap is picked up next poll.
		const fresh: IDataObject[] = [];
		let watermark = toBigInt(staticData.lastEventId);
		for (let page = 0; page < MAX_PAGES_PER_POLL; page++) {
			const rows = (await zabbixApiRequest.call(this, 'event.get', {
				...query,
				eventid_from: String(watermark + BigInt(1)),
				sortfield: ['eventid'],
				sortorder: 'ASC',
				limit: PAGE_SIZE,
			})) as IDataObject[];
			if (!Array.isArray(rows) || rows.length === 0) break;
			fresh.push(...rows);
			watermark = rows.reduce((max, r) => (toBigInt(r.eventid) > max ? toBigInt(r.eventid) : max), watermark);
			if (rows.length < PAGE_SIZE) break;
		}

		let matching = fresh;
		if (mode === 'resolved' && minSeverity > 0) {
			matching = matching.filter(
				(e) => Number((e.relatedObject as IDataObject | undefined)?.priority ?? 0) >= minSeverity,
			);
		}
		matching = matching.filter(nameFilter.call(this));

		const items = await enrich.call(this, mode, matching);
		staticData.lastEventId = String(watermark);
		return items.length ? [items.map((json) => ({ json }))] : null;
	}
}

/** Build the name include/exclude predicate. Accepts a leading `(?i)` for case-insensitive. */
function nameFilter(this: IPollFunctions): (event: IDataObject) => boolean {
	const compile = (parameter: string) => {
		const raw = String(this.getNodeParameter(parameter, '') ?? '').trim();
		if (!raw) return null;
		const insensitive = raw.startsWith('(?i)');
		try {
			return new RegExp(insensitive ? raw.slice(4) : raw, insensitive ? 'i' : '');
		} catch {
			throw new NodeOperationError(this.getNode(), `${parameter === 'nameMatches' ? 'Name Matches' : 'Name Excludes'} is not a valid regular expression`);
		}
	};
	const include = compile('nameMatches');
	const exclude = compile('nameExcludes');
	return (event) => {
		const name = String(event.name ?? '');
		return (!include || include.test(name)) && !(exclude && exclude.test(name));
	};
}

function readFilters(this: IPollFunctions): IDataObject {
	const raw = this.getNodeParameter('additionalFilters', '{}') as IDataObject | string;
	if (typeof raw === 'object' && raw !== null) return raw;
	if (!raw || !String(raw).trim()) return {};
	try {
		return jsonParse<IDataObject>(String(raw));
	} catch {
		throw new NodeOperationError(this.getNode(), 'Additional Filters (JSON) contains invalid JSON');
	}
}

/**
 * Add the fields an alert or ticket usually needs: a readable severity, a link to
 * the event in the Zabbix frontend and, for recoveries, the original problem and
 * how long it lasted.
 */
async function enrich(this: IPollFunctions, mode: string, events: IDataObject[]): Promise<IDataObject[]> {
	if (!events.length) return events;
	const credentials = await this.getCredentials('zabbixTokenApi');
	const baseUrl = zabbixBaseUrl(String(credentials.url));

	const problemsByRecovery = new Map<string, IDataObject>();
	if (mode === 'resolved') {
		const triggerIds = [...new Set(events.map((e) => String(e.objectid)))];
		const maxId = events.reduce((m, e) => (toBigInt(e.eventid) > m ? toBigInt(e.eventid) : m), BigInt(0));
		const problems = (await zabbixApiRequest.call(this, 'event.get', {
			output: 'extend',
			source: 0,
			object: 0,
			value: 1,
			objectids: triggerIds,
			eventid_till: String(maxId),
			sortfield: ['eventid'],
			sortorder: 'DESC',
			limit: 1000,
		})) as IDataObject[];
		for (const problem of problems) {
			if (problem.r_eventid && problem.r_eventid !== '0') {
				problemsByRecovery.set(String(problem.r_eventid), problem);
			}
		}
	}

	const timeZone = this.getTimezone();
	return events.map((event) => {
		const out: IDataObject = { ...event };
		const isTriggerEvent = String(event.source) === '0' && String(event.object) === '0';
		const problem = problemsByRecovery.get(String(event.eventid));
		const severity = Number(
			problem?.severity ??
				(mode === 'resolved' ? (event.relatedObject as IDataObject | undefined)?.priority : event.severity) ??
				0,
		);

		if (isTriggerEvent) {
			out.severity_name = severityName(severity);
			out.event_url = eventUrl(baseUrl, event, problem ? problem.eventid : event.eventid);
		}
		out.since = new Date(Number(event.clock) * 1000).toISOString();
		out.since_local = localTime(event.clock, timeZone);
		if (problem) {
			out.problem = problem;
			out.duration_seconds = Number(event.clock) - Number(problem.clock);
		}
		return out;
	});
}
