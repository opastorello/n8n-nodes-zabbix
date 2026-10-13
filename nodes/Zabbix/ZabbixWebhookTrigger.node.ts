import {
	jsonParse,
	NodeConnectionTypes,
	type IDataObject,
	type IHookFunctions,
	type INodeType,
	type INodeTypeDescription,
	type IWebhookFunctions,
	type IWebhookResponseData,
} from 'n8n-workflow';

import { SEVERITY_NAMES, asRows, parseSeverity, severityName } from './helpers/eventFormat';
import { webhookMediaType } from './helpers/webhookMediaType';
import { zabbixApiRequest, zabbixCredentialTest } from './transport';

/**
 * Receives alerts pushed by a Zabbix webhook media type (create one with the
 * Zabbix node: Media Type → Create n8n Webhook). Push instead of polling: the
 * workflow starts the moment Zabbix's action fires.
 */
export class ZabbixWebhookTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Zabbix Webhook Trigger',
		name: 'zabbixWebhookTrigger',
		icon: { light: 'file:../../icons/zabbix.svg', dark: 'file:../../icons/zabbix.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{"On " + $parameter["events"].join(", ")}}',
		description: 'Starts the workflow when a Zabbix action sends an alert to this webhook',
		defaults: {
			name: 'Zabbix Webhook Trigger',
		},
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'zabbixTokenApi',
				required: true,
				testedBy: 'zabbixApiCredentialTest',
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'zabbix',
			},
		],
		properties: [
			{
				displayName:
					'When the workflow is activated, this node creates (or re-enables) a webhook media type in Zabbix pointing at its Production URL; deactivating only disables it. To receive alerts, add that media type to a Zabbix user and send to that user from an action.',
				name: 'setupNotice',
				type: 'notice',
				default: '',
			},
			{
				displayName: 'Media Type Name',
				name: 'mediaTypeName',
				type: 'string',
				default: 'n8n',
				required: true,
				description: 'Name of the media type this node manages in Zabbix (one per workflow — make it unique)',
			},
			{
				displayName: 'Shared Secret',
				name: 'secret',
				type: 'string',
				typeOptions: { password: true },
				default: '',
				description:
					'If set, requests must carry it in the X-Zabbix-Token header (the media type sends it) — others are rejected with HTTP 401',
			},
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				default: ['problem', 'recovery', 'update'],
				description: 'Which alerts start the workflow',
				options: [
					{ name: 'Acknowledge / Update', value: 'update', description: 'Someone acknowledged, commented or changed the problem' },
					{ name: 'Problem', value: 'problem', description: 'A problem started' },
					{ name: 'Recovery', value: 'recovery', description: 'A problem resolved' },
				],
			},
			{
				displayName: 'Minimum Severity',
				name: 'minSeverity',
				type: 'options',
				default: 0,
				description: 'Ignore alerts below this severity',
				options: SEVERITY_NAMES.map((name, value) => ({ name, value })).sort((a, b) => a.name.localeCompare(b.name)),
			},
		],
	};

	methods = {
		credentialTest: { zabbixApiCredentialTest: zabbixCredentialTest },
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const existing = await findMediaType.call(this);
				const url = this.getNodeWebhookUrl('default');
				const params = (existing?.parameters as IDataObject[]) ?? [];
				const current = (name: string) => params.find((p) => p.name === name)?.value;
				const secret = String(this.getNodeParameter('secret', '') ?? '');
				if (!existing || String(existing.status) !== '0' || current('url') !== url || String(current('token') ?? '') !== secret) {
					return false;
				}
				this.getWorkflowStaticData('node').mediatypeid = existing.mediatypeid;
				return true;
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const name = String(this.getNodeParameter('mediaTypeName', 'n8n'));
				const url = this.getNodeWebhookUrl('default') as string;
				const secret = String(this.getNodeParameter('secret', '') ?? '');
				const body = webhookMediaType(name, url, secret);
				const existing = await findMediaType.call(this);
				if (existing) {
					await zabbixApiRequest.call(this, 'mediatype.update', { ...body, mediatypeid: existing.mediatypeid, status: 0 });
					this.getWorkflowStaticData('node').mediatypeid = existing.mediatypeid;
				} else {
					const result = (await zabbixApiRequest.call(this, 'mediatype.create', body)) as IDataObject;
					this.getWorkflowStaticData('node').mediatypeid = ((result.mediatypeids as string[]) ?? [])[0];
				}
				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const data = this.getWorkflowStaticData('node');
				// Disable rather than delete: deleting a media type also deletes every
				// user's media of that type, which would have to be set up again.
				if (data.mediatypeid) {
					try {
						await zabbixApiRequest.call(this, 'mediatype.update', { mediatypeid: data.mediatypeid, status: 1 });
					} catch (error) {
						this.logger.warn(
							`Zabbix Webhook Trigger: could not disable media type ${String(data.mediatypeid)}: ${(error as Error).message}`,
						);
						return false;
					}
					delete data.mediatypeid;
				}
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const secret = String(this.getNodeParameter('secret', '') ?? '');
		const headers = this.getHeaderData() as IDataObject;
		if (secret && String(headers['x-zabbix-token'] ?? '') !== secret) {
			const res = this.getResponseObject();
			res.status(401).json({ error: 'Invalid or missing X-Zabbix-Token' });
			return { noWebhookResponse: true };
		}

		const body = (this.getBodyData() ?? {}) as IDataObject;
		const alert = normalizeAlert(body);

		const events = this.getNodeParameter('events', []) as string[];
		const minSeverity = parseSeverity(this.getNodeParameter('minSeverity', 0));
		if ((events.length && !events.includes(String(alert.kind))) || Number(alert.severity) < minSeverity) {
			return { webhookResponse: { status: 'ignored' }, workflowData: [[]] };
		}
		return { workflowData: [[{ json: alert }]] };
	}
}

async function findMediaType(this: IHookFunctions): Promise<IDataObject | undefined> {
	const name = String(this.getNodeParameter('mediaTypeName', 'n8n'));
	const rows = asRows(
		await zabbixApiRequest.call(this, 'mediatype.get', {
			filter: { name },
			output: ['mediatypeid', 'name', 'status', 'parameters'],
		}),
	);
	return rows[0];
}

const MACRO = /^\{[A-Z0-9.$_]+\}$/;

/** Turn the media type's flat string parameters into a typed alert. Unresolved macros become null. */
export function normalizeAlert(body: IDataObject): IDataObject {
	const text = (key: string) => {
		const value = body[key];
		if (value === undefined || value === null) return null;
		const s = String(value);
		return s === '' || MACRO.test(s) ? null : s;
	};
	const updateStatus = text('event_update_status');
	const value = text('event_value');
	const kind = updateStatus === '1' ? 'update' : value === '0' ? 'recovery' : 'problem';
	let tags: IDataObject[] = [];
	const rawTags = text('event_tags');
	if (rawTags) {
		try {
			tags = jsonParse<IDataObject[]>(rawTags);
		} catch {
			tags = [];
		}
	}
	const severity = parseSeverity(text('event_severity') ?? 0);
	return {
		kind,
		eventid: text('event_id'),
		recovery_eventid: text('event_recovery_id'),
		name: text('event_name'),
		severity,
		severity_name: severityName(severity),
		host: text('host'),
		host_name: text('host_name'),
		host_ip: text('host_ip'),
		triggerid: text('trigger_id'),
		date: text('event_date'),
		opdata: text('event_opdata'),
		tags,
		update: kind === 'update'
			? { action: text('event_update_action'), message: text('event_update_message'), user: text('event_update_user') }
			: null,
		subject: text('alert_subject'),
		message: text('alert_message'),
		raw: body,
	};
}
