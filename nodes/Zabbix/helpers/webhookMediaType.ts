import type { IDataObject } from 'n8n-workflow';

/**
 * Zabbix webhook media type that POSTs every alert to the Zabbix Webhook
 * Trigger node. Parameters are Zabbix macros resolved per alert; the script
 * forwards all of them (except url/token) as a JSON body.
 */
export const WEBHOOK_SCRIPT = `var params = JSON.parse(value);
var request = new HttpRequest();
request.addHeader('Content-Type: application/json');
if (params.token) {
    request.addHeader('X-Zabbix-Token: ' + params.token);
}
var body = {};
Object.keys(params).forEach(function (key) {
    if (key !== 'url' && key !== 'token') {
        body[key] = params[key];
    }
});
var response = request.post(params.url, JSON.stringify(body));
if (request.getStatus() < 200 || request.getStatus() >= 300) {
    throw 'n8n webhook returned HTTP ' + request.getStatus() + ': ' + response;
}
return 'OK';`;

/** Macro parameters sent with every alert: [parameter name, Zabbix macro]. */
const MACROS: Array<[string, string]> = [
	['event_id', '{EVENT.ID}'],
	['event_value', '{EVENT.VALUE}'],
	['event_name', '{EVENT.NAME}'],
	['event_severity', '{EVENT.NSEVERITY}'],
	['event_date', '{EVENT.DATE} {EVENT.TIME}'],
	['event_tags', '{EVENT.TAGSJSON}'],
	['event_opdata', '{EVENT.OPDATA}'],
	['event_recovery_id', '{EVENT.RECOVERY.ID}'],
	['event_update_status', '{EVENT.UPDATE.STATUS}'],
	['event_update_action', '{EVENT.UPDATE.ACTION}'],
	['event_update_message', '{EVENT.UPDATE.MESSAGE}'],
	['event_update_user', '{USER.FULLNAME}'],
	['trigger_id', '{TRIGGER.ID}'],
	['host', '{HOST.HOST}'],
	['host_name', '{HOST.NAME}'],
	['host_ip', '{HOST.IP}'],
	['alert_subject', '{ALERT.SUBJECT}'],
	['alert_message', '{ALERT.MESSAGE}'],
];

const MESSAGES: Array<[number, string, string]> = [
	[0, 'Problem: {EVENT.NAME}', 'Problem started at {EVENT.TIME} on {EVENT.DATE}\nHost: {HOST.NAME}\nSeverity: {EVENT.SEVERITY}'],
	[1, 'Resolved: {EVENT.NAME}', 'Problem resolved at {EVENT.RECOVERY.TIME} on {EVENT.RECOVERY.DATE}\nHost: {HOST.NAME}'],
	[2, 'Updated: {EVENT.NAME}', '{USER.FULLNAME} {EVENT.UPDATE.ACTION} problem at {EVENT.UPDATE.DATE} {EVENT.UPDATE.TIME}.\n{EVENT.UPDATE.MESSAGE}'],
];

/** `mediatype.create` parameters for a webhook pointing at `url`. */
export function webhookMediaType(name: string, url: string, secret: string): IDataObject {
	return {
		type: 4,
		name,
		// Zabbix creates media types disabled unless told otherwise.
		status: 0,
		script: WEBHOOK_SCRIPT,
		timeout: '30s',
		parameters: [['url', url] as [string, string], ['token', secret] as [string, string], ...MACROS].map(
			([param, macro]) => ({ name: param, value: macro }),
		),
		message_templates: MESSAGES.map(([recovery, subject, message]) => ({ eventsource: 0, recovery, subject, message })),
	};
}
