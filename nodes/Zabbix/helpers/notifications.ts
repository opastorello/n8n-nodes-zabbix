import type { IDataObject } from 'n8n-workflow';

import { zabbixApiRequest, type ZabbixRequestContext } from '../transport';
import { asRows, severityName } from './eventFormat';

/** true / false, or null when the node can't decide (the condition then counts as "maybe"). */
type Tri = boolean | null;

const CONDITION_NAMES: Record<string, string> = {
	'0': 'host group',
	'1': 'host',
	'2': 'trigger',
	'3': 'event name',
	'4': 'trigger severity',
	'6': 'time period',
	'13': 'template',
	'16': 'problem is suppressed',
	'25': 'event tag',
	'26': 'event tag value',
};

interface IEventFacts {
	groupids: string[];
	hostids: string[];
	templateids: string[];
	triggerid: string;
	name: string;
	severity: number;
	suppressed: boolean;
	tags: Array<{ tag: string; value: string }>;
}

function compareText(operator: string, actual: string, expected: string): Tri {
	switch (operator) {
		case '0':
			return actual === expected;
		case '1':
			return actual !== expected;
		case '2':
			return actual.toLowerCase().includes(expected.toLowerCase());
		case '3':
			return !actual.toLowerCase().includes(expected.toLowerCase());
		default:
			return null;
	}
}

function inList(operator: string, list: string[], value: string): Tri {
	if (operator === '0') return list.includes(value);
	if (operator === '1') return !list.includes(value);
	return null;
}

function evaluateCondition(condition: IDataObject, facts: IEventFacts): Tri {
	const type = String(condition.conditiontype);
	const operator = String(condition.operator);
	const value = String(condition.value ?? '');
	switch (type) {
		case '0':
			return inList(operator, facts.groupids, value);
		case '1':
			return inList(operator, facts.hostids, value);
		case '2':
			return inList(operator, [facts.triggerid], value);
		case '13':
			return inList(operator, facts.templateids, value);
		case '3':
			return compareText(operator, facts.name, value);
		case '4': {
			const expected = Number(value);
			if (operator === '0') return facts.severity === expected;
			if (operator === '1') return facts.severity !== expected;
			if (operator === '5') return facts.severity >= expected;
			if (operator === '6') return facts.severity <= expected;
			return null;
		}
		case '16':
			if (operator === '10') return facts.suppressed;
			if (operator === '11') return !facts.suppressed;
			return null;
		case '25': {
			const results = facts.tags.map((t) => compareText(operator, t.tag, value));
			// "not equals"/"not contains" must hold for every tag; the others for any tag.
			return operator === '1' || operator === '3' ? results.every((r) => r === true) : results.some((r) => r === true);
		}
		case '26': {
			const tagName = String(condition.value2 ?? '');
			const values = facts.tags.filter((t) => t.tag === tagName).map((t) => t.value);
			const results = values.map((v) => compareText(operator, v, value));
			return operator === '1' || operator === '3' ? results.every((r) => r === true) : results.some((r) => r === true);
		}
		default:
			return null;
	}
}

const and = (a: Tri, b: Tri): Tri => (a === false || b === false ? false : a === null || b === null ? null : true);
const or = (a: Tri, b: Tri): Tri => (a === true || b === true ? true : a === null || b === null ? null : false);
const not = (a: Tri): Tri => (a === null ? null : !a);

/** Evaluate a custom expression like `A and (B or not C)` over tri-state values. */
function evaluateFormula(formula: string, values: Record<string, Tri>): Tri {
	const tokens = formula.match(/\(|\)|\band\b|\bor\b|\bnot\b|[A-Z]+/gi) ?? [];
	let pos = 0;
	const parseOr = (): Tri => {
		let left = parseAnd();
		while (tokens[pos]?.toLowerCase() === 'or') {
			pos++;
			left = or(left, parseAnd());
		}
		return left;
	};
	const parseAnd = (): Tri => {
		let left = parseUnary();
		while (tokens[pos]?.toLowerCase() === 'and') {
			pos++;
			left = and(left, parseUnary());
		}
		return left;
	};
	const parseUnary = (): Tri => {
		const token = tokens[pos++];
		if (token?.toLowerCase() === 'not') return not(parseUnary());
		if (token === '(') {
			const inner = parseOr();
			pos++; // ')'
			return inner;
		}
		return token !== undefined && token in values ? values[token] : null;
	};
	return parseOr();
}

function evaluateAction(action: IDataObject, facts: IEventFacts): { result: Tri; unknown: string[] } {
	const filter = (action.filter as IDataObject) ?? {};
	const conditions = (filter.conditions as IDataObject[]) ?? [];
	const unknown: string[] = [];
	const results = conditions.map((c) => {
		const r = evaluateCondition(c, facts);
		if (r === null) unknown.push(CONDITION_NAMES[String(c.conditiontype)] ?? `condition type ${String(c.conditiontype)}`);
		return { c, r };
	});
	if (!results.length) return { result: true, unknown };
	const evaltype = String(filter.evaltype ?? '0');
	if (evaltype === '1') return { result: results.reduce<Tri>((acc, x) => and(acc, x.r), true), unknown };
	if (evaltype === '2') return { result: results.reduce<Tri>((acc, x) => or(acc, x.r), false), unknown };
	if (evaltype === '3') {
		const values: Record<string, Tri> = {};
		for (const x of results) values[String(x.c.formulaid)] = x.r;
		return { result: evaluateFormula(String(filter.formula ?? ''), values), unknown };
	}
	// And/Or: conditions of the same type are OR-ed, different types AND-ed.
	const byType = new Map<string, Tri>();
	for (const x of results) {
		const type = String(x.c.conditiontype);
		byType.set(type, byType.has(type) ? or(byType.get(type) as Tri, x.r) : x.r);
	}
	return { result: [...byType.values()].reduce<Tri>((acc, r) => and(acc, r), true), unknown };
}

interface INames {
	users: Map<string, string>;
	groups: Map<string, string>;
	media: Map<string, string>;
}

function describeOperations(operations: IDataObject[], names: INames): IDataObject[] {
	return operations
		.filter((op) => String(op.operationtype) === '0' || String(op.operationtype) === '11' || String(op.operationtype) === '12')
		.map((op) => {
			const message = (op.opmessage as IDataObject) ?? {};
			const mediaId = String(message.mediatypeid ?? '0');
			const groups = ((op.opmessage_grp as IDataObject[]) ?? []).map((g) => names.groups.get(String(g.usrgrpid)) ?? String(g.usrgrpid));
			const users = ((op.opmessage_usr as IDataObject[]) ?? []).map((u) => names.users.get(String(u.userid)) ?? String(u.userid));
			const type = String(op.operationtype);
			return {
				via: mediaId === '0' ? 'all media of each recipient' : (names.media.get(mediaId) ?? mediaId),
				user_groups: groups,
				users,
				...(type === '11' ? { to: 'everyone notified about the problem' } : {}),
				...(type === '12' ? { to: 'everyone who acknowledged/commented' } : {}),
				...(op.esc_step_from !== undefined ? { step_from: Number(op.esc_step_from), step_to: Number(op.esc_step_to) } : {}),
			};
		});
}

/**
 * Which enabled trigger actions would act on this event, and who they notify on
 * the problem, on an acknowledge/update, and on recovery.
 */
export async function whoGetsNotified(this: ZabbixRequestContext, eventid: string): Promise<IDataObject> {
	const [event] = asRows(
		await zabbixApiRequest.call(this, 'event.get', {
			eventids: [eventid],
			output: ['eventid', 'name', 'severity', 'objectid', 'source', 'object', 'suppressed'],
			selectHosts: ['hostid'],
			selectTags: 'extend',
		}),
	);
	if (!event) return { eventid, found: false, error: `No event ${eventid} — check the ID and the API user's permissions` };
	if (String(event.source) !== '0') {
		return { eventid, found: true, error: 'Only trigger events (source 0) are evaluated' };
	}

	const hostids = ((event.hosts as IDataObject[]) ?? []).map((h) => String(h.hostid));
	const hosts = asRows(
		await zabbixApiRequest.call(this, 'host.get', {
			hostids,
			output: ['hostid'],
			selectHostGroups: ['groupid'],
			selectParentTemplates: ['templateid'],
		}),
	);
	const facts: IEventFacts = {
		groupids: hosts.flatMap((h) => ((h.hostgroups as IDataObject[]) ?? []).map((g) => String(g.groupid))),
		hostids,
		templateids: hosts.flatMap((h) => ((h.parentTemplates as IDataObject[]) ?? []).map((t) => String(t.templateid))),
		triggerid: String(event.objectid),
		name: String(event.name ?? ''),
		severity: Number(event.severity ?? 0),
		suppressed: String(event.suppressed ?? '0') === '1',
		tags: ((event.tags as IDataObject[]) ?? []).map((t) => ({ tag: String(t.tag), value: String(t.value ?? '') })),
	};

	const actions = asRows(
		await zabbixApiRequest.call(this, 'action.get', {
			filter: { eventsource: 0, status: 0 },
			output: ['actionid', 'name'],
			selectFilter: 'extend',
			selectOperations: 'extend',
			selectUpdateOperations: 'extend',
			selectRecoveryOperations: 'extend',
		}),
	);

	const ids = (key: string, inner: string) =>
		[...new Set(actions.flatMap((a) => ['operations', 'update_operations', 'recovery_operations'].flatMap((k) => ((a[k] as IDataObject[]) ?? []).flatMap((op) => ((op[key] as IDataObject[]) ?? []).map((x) => String(x[inner]))))))];
	const mediaIds = [...new Set(actions.flatMap((a) => ['operations', 'update_operations', 'recovery_operations'].flatMap((k) => ((a[k] as IDataObject[]) ?? []).map((op) => String(((op.opmessage as IDataObject) ?? {}).mediatypeid ?? '0')))))].filter((id) => id !== '0');
	const userIds = ids('opmessage_usr', 'userid');
	const groupIds = ids('opmessage_grp', 'usrgrpid');
	const names: INames = {
		users: new Map(userIds.length ? asRows(await zabbixApiRequest.call(this, 'user.get', { userids: userIds, output: ['userid', 'username'] })).map((u) => [String(u.userid), String(u.username)]) : []),
		groups: new Map(groupIds.length ? asRows(await zabbixApiRequest.call(this, 'usergroup.get', { usrgrpids: groupIds, output: ['usrgrpid', 'name'] })).map((g) => [String(g.usrgrpid), String(g.name)]) : []),
		media: new Map(mediaIds.length ? asRows(await zabbixApiRequest.call(this, 'mediatype.get', { mediatypeids: mediaIds, output: ['mediatypeid', 'name'] })).map((m) => [String(m.mediatypeid), String(m.name)]) : []),
	};

	const evaluated = actions.map((action) => {
		const { result, unknown } = evaluateAction(action, facts);
		return {
			actionid: action.actionid,
			name: action.name,
			matches: result === true ? 'yes' : result === false ? 'no' : 'maybe',
			not_evaluated: unknown,
			on_problem: describeOperations((action.operations as IDataObject[]) ?? [], names),
			on_acknowledge: describeOperations((action.update_operations as IDataObject[]) ?? [], names),
			on_recovery: describeOperations((action.recovery_operations as IDataObject[]) ?? [], names),
		};
	});
	const relevant = evaluated.filter((a) => a.matches !== 'no');
	const ackNotifies = relevant.filter((a) => a.on_acknowledge.length);

	return {
		eventid,
		found: true,
		event: { name: facts.name, severity_name: severityName(facts.severity), suppressed: facts.suppressed },
		acknowledge_will_notify: ackNotifies.length > 0,
		summary: ackNotifies.length
			? `Acknowledging/commenting will notify through ${ackNotifies.length} action(s): ${ackNotifies.map((a) => `${String(a.name)}${a.matches === 'maybe' ? ' (maybe)' : ''}`).join(', ')}`
			: relevant.length
				? 'Matching actions have no update operations — acknowledging sends no notifications'
				: 'No enabled trigger action matches this event',
		actions: relevant,
		not_matching: evaluated.filter((a) => a.matches === 'no').map((a) => a.name),
	};
}
