import type { IDataObject } from 'n8n-workflow';

import { zabbixApiRequest, type ZabbixRequestContext } from '../transport';

/** A `*.get` result as rows; anything unexpected becomes an empty list. */
export function asRows(result: unknown): IDataObject[] {
	return Array.isArray(result) ? (result as IDataObject[]) : [];
}

export const SEVERITY_NAMES =['Not classified', 'Information', 'Warning', 'Average', 'High', 'Disaster'];

/** Severity filter options shared by the problem/event operations and the trigger. */
export const SEVERITY_OPTIONS = [
	{ name: 'Average', value: 3, description: 'Average, High and Disaster' },
	{ name: 'Disaster', value: 5, description: 'Disaster only' },
	{ name: 'High', value: 4, description: 'High and Disaster' },
	{ name: 'Information', value: 1, description: 'Everything except Not Classified' },
	{ name: 'Not Classified', value: 0, description: 'Every severity' },
	{ name: 'Warning', value: 2, description: 'Warning and above' },
];

/** `[3, 4, 5]` for minimum severity 3; empty (no filter) for 0. */
export function severitiesFrom(minimum: number): number[] {
	return minimum > 0 ? Array.from({ length: 6 - minimum }, (_, k) => minimum + k) : [];
}

export function severityName(value: unknown): string {
	const n = Number(value);
	return SEVERITY_NAMES[n] ?? String(value);
}

/** Epoch seconds → `2026-10-13 14:05:00` in the given IANA time zone. */
export function localTime(epochSeconds: unknown, timeZone: string): string {
	const date = new Date(Number(epochSeconds) * 1000);
	try {
		return new Intl.DateTimeFormat('sv-SE', {
			timeZone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
		}).format(date);
	} catch {
		return date.toISOString();
	}
}

export function eventUrl(baseUrl: string, event: IDataObject, problemEventId?: unknown): string | undefined {
	if (String(event.source ?? '0') !== '0' || String(event.object ?? '0') !== '0') return undefined;
	return `${baseUrl}/tr_events.php?triggerid=${String(event.objectid)}&eventid=${String(problemEventId ?? event.eventid)}`;
}

/**
 * Add readable fields to a problem/event row (the raw fields are kept):
 * `severity_name`, `event_url`, `since` (ISO, UTC), `since_local` (workflow
 * time zone) and `duration_seconds` (until recovery, or until now if open).
 */
export function enrichEvent(row: IDataObject, baseUrl: string, timeZone: string): IDataObject {
	const out: IDataObject = { ...row };
	if (row.severity !== undefined) out.severity_name = severityName(row.severity);
	const url = eventUrl(baseUrl, row);
	if (url) out.event_url = url;
	if (row.clock !== undefined) {
		const start = Number(row.clock);
		const end = row.r_clock && String(row.r_clock) !== '0' ? Number(row.r_clock) : Math.floor(Date.now() / 1000);
		out.since = new Date(start * 1000).toISOString();
		out.since_local = localTime(start, timeZone);
		out.duration_seconds = Math.max(0, end - start);
	}
	return out;
}

/** The handful of fields an alert, ticket or AI agent actually needs. */
export function simplifyEvent(row: IDataObject): IDataObject {
	const hosts = (row.hosts as IDataObject[] | undefined) ?? [];
	const tags = (row.tags as IDataObject[] | undefined) ?? [];
	return {
		eventid: row.eventid,
		name: row.name,
		severity: Number(row.severity ?? 0),
		severity_name: row.severity_name,
		host: hosts.map((h) => h.name ?? h.host).join(', ') || undefined,
		hostid: hosts[0]?.hostid,
		since: row.since,
		since_local: row.since_local,
		duration_seconds: row.duration_seconds,
		resolved: row.r_eventid !== undefined ? String(row.r_eventid) !== '0' : undefined,
		acknowledged: String(row.acknowledged ?? '0') === '1',
		suppressed: String(row.suppressed ?? '0') === '1',
		tags: tags.map((t) => (t.value ? `${String(t.tag)}:${String(t.value)}` : String(t.tag))),
		url: row.event_url,
	};
}

/**
 * problem.get can't return hosts (no selectHosts); fetch them for the same
 * event IDs through event.get and attach them as `hosts`.
 */
export async function attachHosts(this: ZabbixRequestContext, rows: IDataObject[]): Promise<void> {
	const eventids = rows.map((r) => r.eventid).filter((id) => id !== undefined);
	if (!eventids.length) return;
	const events = (await zabbixApiRequest.call(this, 'event.get', {
		eventids,
		output: ['eventid'],
		selectHosts: ['hostid', 'host', 'name'],
	})) as IDataObject[];
	const byId = new Map(events.map((e) => [String(e.eventid), e.hosts]));
	for (const row of rows) {
		if (row.hosts === undefined) row.hosts = byId.get(String(row.eventid)) ?? [];
	}
}
