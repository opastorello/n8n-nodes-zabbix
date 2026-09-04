import type {
	IPollFunctions,
	IDataObject,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

import { zabbixApiRequest } from './transport';
import { loadOptionsMethods } from './methods/loadOptions';

/**
 * Polling trigger: starts a workflow when new problems (or events) appear in
 * Zabbix. Progress is tracked per node via a watermark on the highest seen
 * event ID, so each item fires exactly once.
 */
export class ZabbixTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Zabbix Trigger',
		name: 'zabbixTrigger',
		icon: { light: 'file:../../icons/zabbix.svg', dark: 'file:../../icons/zabbix.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{"On new " + $parameter["event"]}}',
		description: 'Starts the workflow when new Zabbix problems or events occur',
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
			},
		],
		properties: [
			{
				displayName:
					'On the first poll this trigger only records the current position — it does not replay old problems. From then on, each new problem/event fires exactly once. Use "Test workflow" to see a sample of the latest problem.',
				name: 'watermarkNotice',
				type: 'notice',
				default: '',
			},
			{
				displayName: 'Trigger On',
				name: 'event',
				type: 'options',
				default: 'problem',
				description: 'Which Zabbix objects should start the workflow',
				options: [
					{ name: 'New Event', value: 'event', description: 'Fire on any new event (problem or resolution)' },
					{ name: 'New Problem', value: 'problem', description: 'Fire when a new problem is created' },
				],
			},
			{
				displayName: 'Host Group Names or IDs',
				name: 'groupids',
				type: 'multiOptions',
				typeOptions: { loadOptionsMethod: 'getHostGroups' },
				default: [],
				description:
					'Only fire for problems/events in these host groups (leave empty for all). Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'Minimum Severity',
				name: 'severity',
				type: 'options',
				default: 0,
				description: 'Only fire for problems at or above this severity',
				displayOptions: { show: { event: ['problem'] } },
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
				displayName: 'Additional Filters (JSON)',
				name: 'additionalFilters',
				type: 'json',
				default: '{}',
				placeholder: '{ "tags": [{"tag": "env", "value": "prod"}] }',
				hint: 'Any parameter of problem.get / event.get works here, e.g. tag filters or acknowledged: false',
				description: 'Extra parameters merged into the problem.get / event.get request',
			},
		],
	};

	methods = {
		loadOptions: loadOptionsMethods as unknown as Record<
			string,
			(this: ILoadOptionsFunctions) => Promise<INodePropertyOptions[]>
		>,
	};

	async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
		const eventType = this.getNodeParameter('event', 'problem') as string;
		const method = eventType === 'event' ? 'event.get' : 'problem.get';

		const staticData = this.getWorkflowStaticData('node');
		const lastId = (staticData.lastEventId as string) || '0';

		const params: IDataObject = {
			output: 'extend',
			selectTags: 'extend',
			sortfield: 'eventid',
			sortorder: 'DESC',
			limit: 100,
		};

		const groupids = this.getNodeParameter('groupids', []) as string[];
		if (groupids.length) params.groupids = groupids;

		if (eventType === 'problem') {
			const severity = this.getNodeParameter('severity', 0) as number;
			if (severity > 0) {
				params.severities = Array.from({ length: 6 - severity }, (_, k) => severity + k);
			}
		}

		const extra = this.getNodeParameter('additionalFilters', {}) as IDataObject | string;
		if (typeof extra === 'object') Object.assign(params, extra);

		// On the very first poll only establish the watermark, don't replay history.
		const isFirstPoll = staticData.lastEventId === undefined;
		if (isFirstPoll) params.limit = 1;

		const results = (await zabbixApiRequest.call(this, method, params)) as IDataObject[];

		if (!Array.isArray(results) || results.length === 0) {
			// Nothing open at activation time: baseline at zero so the very first
			// problem that appears later fires (instead of being swallowed as the
			// bootstrap sample).
			if (isFirstPoll) staticData.lastEventId = '0';
			return null;
		}

		// Highest eventid seen this round becomes the new watermark.
		const highest = results
			.map((r) => String(r.eventid ?? '0'))
			.reduce((a, b) => (BigInt(a) > BigInt(b) ? a : b), lastId);
		staticData.lastEventId = highest;

		if (isFirstPoll) {
			// Manual test executions still want to see something; return latest.
			if (this.getMode() === 'manual') {
				return [results.map((json) => ({ json }))];
			}
			return null;
		}

		const fresh = results.filter((r) => BigInt(String(r.eventid ?? '0')) > BigInt(lastId));
		if (fresh.length === 0) return null;

		// Emit oldest-first so downstream ordering is chronological.
		fresh.sort((a, b) => (BigInt(String(a.eventid)) < BigInt(String(b.eventid)) ? -1 : 1));
		return [fresh.map((json) => ({ json }))];
	}
}
