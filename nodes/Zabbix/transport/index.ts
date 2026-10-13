import {
	jsonParse,
	NodeApiError,
	NodeOperationError,
	type ICredentialDataDecryptedObject,
	type ICredentialsDecrypted,
	type ICredentialTestFunctions,
	type IDataObject,
	type INodeCredentialTestResult,
	type IHttpRequestOptions,
	type INode,
	type JsonObject,
} from 'n8n-workflow';

import type { IZabbixResponse } from '../helpers/interfaces';

/**
 * What the transport needs from an n8n context. Execute, poll, hook and
 * load-options contexts all satisfy it; the credential test builds one by hand.
 */
export interface ZabbixRequestContext {
	getCredentials(type: string): Promise<ICredentialDataDecryptedObject>;
	getNode(): INode;
	helpers: { httpRequest(options: IHttpRequestOptions): Promise<unknown> };
}

export const CREDENTIAL_TYPE = 'zabbixTokenApi';

export interface ZabbixVersion {
	major: number;
	minor: number;
	text: string;
}

/** Normalize the credential URL: drop trailing slashes and a pasted `/api_jsonrpc.php`. */
export function zabbixBaseUrl(url: string): string {
	return url.trim().replace(/(\/api_jsonrpc\.php)?\/*$/, '');
}

/** Methods that only read; everything else is blocked by a read-only credential. */
const READ_METHOD =
	/\.(get|getsli|getscriptsbyhosts|getscriptsbyevents|export|importcompare|version|checkauthentication)$/i;

export function isReadMethod(method: string): boolean {
	return READ_METHOD.test(method);
}

/**
 * Perform a Zabbix JSON-RPC 2.0 call and return its `result`.
 *
 * Adapts to the server version: Zabbix < 6.4 takes the credential in the
 * request body (`auth`), 6.4+ as an `Authorization: Bearer` header (7.2 removed
 * the body field). The credential may be an API token or a username/password,
 * in which case a session is obtained with `user.login`, cached, and renewed
 * once when Zabbix reports it expired.
 *
 * Methods removed in Zabbix 8.0 (the four `*.massupdate`) are rebuilt from the
 * methods that replaced them, so workflows keep working across versions.
 */
export async function zabbixApiRequest(
	this: ZabbixRequestContext,
	method: string,
	params: IDataObject | unknown[] = {},
): Promise<unknown> {
	const credentials = await this.getCredentials(CREDENTIAL_TYPE);
	if (credentials.readOnly === true && !isReadMethod(method)) {
		throw new NodeOperationError(this.getNode(), `Blocked: ${method} would change Zabbix`, {
			description:
				'The Zabbix credential is set to Read-Only, so only read methods (get, export, …) are allowed. Use a credential without Read-Only to make changes.',
		});
	}

	const shim = REMOVED_IN_8[method.toLowerCase()];
	if (!shim || Array.isArray(params)) return await callZabbix.call(this, method, params);

	if ((await zabbixVersion.call(this)).major >= 8) return await shim.call(this, params);
	try {
		return await callZabbix.call(this, method, params);
	} catch (error) {
		// The cached version is stale (Zabbix was upgraded while n8n kept running).
		if (!/not available on Zabbix/i.test((error as Error).message)) {
			throw new NodeOperationError(this.getNode(), error as Error);
		}
		versionCache.delete(zabbixBaseUrl(String(credentials.url)));
		return await shim.call(this, params);
	}
}

const versionCache = new Map<string, Promise<ZabbixVersion>>();

/** Version of the connected Zabbix, fetched once per URL (`apiinfo.version` needs no auth). */
export async function zabbixVersion(this: ZabbixRequestContext): Promise<ZabbixVersion> {
	const credentials = await this.getCredentials(CREDENTIAL_TYPE);
	const key = zabbixBaseUrl(String(credentials.url));
	let version = versionCache.get(key);
	if (!version) {
		version = send.call(this, credentials, 'apiinfo.version', {}).then((v) => {
			const [major, minor] = String(v).split('.').map((part) => parseInt(part, 10) || 0);
			return { major, minor, text: String(v) };
		});
		versionCache.set(key, version);
		version.catch(() => versionCache.delete(key));
	}
	return await version;
}

/** Major version of the connected Zabbix (e.g. 7 or 8). */
export async function zabbixMajorVersion(this: ZabbixRequestContext): Promise<number> {
	return (await zabbixVersion.call(this)).major;
}

const sessionCache = new Map<string, Promise<string>>();

function sessionKey(credentials: ICredentialDataDecryptedObject): string {
	return `${zabbixBaseUrl(String(credentials.url))}\n${String(credentials.username)}`;
}

async function credentialSecret(
	this: ZabbixRequestContext,
	credentials: ICredentialDataDecryptedObject,
): Promise<string> {
	if (credentials.authentication !== 'password') return String(credentials.apiToken ?? '');
	const key = sessionKey(credentials);
	let session = sessionCache.get(key);
	if (!session) {
		session = send
			.call(this, credentials, 'user.login', {
				username: credentials.username,
				password: credentials.password,
			})
			.then((result) => String(result));
		sessionCache.set(key, session);
		session.catch(() => sessionCache.delete(key));
	}
	return await session;
}

async function callZabbix(
	this: ZabbixRequestContext,
	method: string,
	params: IDataObject | unknown[],
): Promise<unknown> {
	const credentials = await this.getCredentials(CREDENTIAL_TYPE);
	// Zabbix rejects these when a credential is attached.
	if (/^(apiinfo\.version|user\.login)$/i.test(method)) {
		return await send.call(this, credentials, method, params);
	}
	const version = await zabbixVersion.call(this);
	const legacyAuth = !atLeast(version, 6, 4);
	const adapted = await adaptRequest.call(this, method, params, version);
	const attempt = async () => {
		const secret = await credentialSecret.call(this, credentials);
		const result = await send.call(this, credentials, method, adapted, { secret, legacyAuth, version });
		return adaptResult(method, params, result, version);
	};
	let failure: unknown;
	try {
		return await attempt();
	} catch (error) {
		failure = error;
	}
	// A cached user.login session expired: log in again once.
	if (credentials.authentication === 'password' && (failure as IDataObject).authRejected) {
		sessionCache.delete(sessionKey(credentials));
		return await attempt();
	}
	throw new NodeOperationError(this.getNode(), failure as Error);
}

export function atLeast(version: ZabbixVersion, major: number, minor = 0): boolean {
	return version.major > major || (version.major === major && version.minor >= minor);
}

const asList = (params: IDataObject | unknown[]) =>
	(Array.isArray(params) ? params : [params]) as IDataObject[];

/**
 * Translate a request written for Zabbix 7.x into what an older server expects,
 * so one workflow works across versions. Only renames that are unambiguous are
 * handled; objects that don't exist on the older server fail with a clear
 * "not available" error instead.
 */
async function adaptRequest(
	this: ZabbixRequestContext,
	method: string,
	params: IDataObject | unknown[],
	version: ZabbixVersion,
): Promise<IDataObject | unknown[]> {
	const m = method.toLowerCase();
	const out = JSON.parse(JSON.stringify(params)) as IDataObject | unknown[];

	if (!atLeast(version, 7, 0)) {
		// 7.0 renamed the proxy fields: host → name, status 5/6 → operating_mode 0/1,
		// interface → address/port; hosts point at it with proxyid (was proxy_hostid).
		if (m === 'host.create' || m === 'host.update' || m === 'host.massupdate') {
			for (const host of asList(out)) {
				if (host.proxyid !== undefined) {
					host.proxy_hostid = host.proxyid;
					delete host.proxyid;
				}
				delete host.monitored_by;
			}
		}
		if (m === 'proxy.create' || m === 'proxy.update') {
			for (const proxy of asList(out)) {
				if (proxy.name !== undefined) {
					proxy.host = proxy.name;
					delete proxy.name;
				}
				if (proxy.operating_mode !== undefined) {
					proxy.status = Number(proxy.operating_mode) === 1 ? 6 : 5;
					delete proxy.operating_mode;
				}
				if (proxy.address !== undefined) {
					proxy.interface = { useip: 1, ip: proxy.address, dns: '', port: proxy.port ?? '10051' };
					delete proxy.address;
					delete proxy.port;
				}
			}
		}
	}

	if (!atLeast(version, 6, 2)) {
		// 6.2 split template groups out of host groups.
		if (m.endsWith('.get') && !Array.isArray(out) && (out as IDataObject).selectHostGroups !== undefined) {
			(out as IDataObject).selectGroups = (out as IDataObject).selectHostGroups;
			delete (out as IDataObject).selectHostGroups;
		}
		if ((m === 'configuration.import' || m === 'configuration.importcompare') && !Array.isArray(out)) {
			const rules = ((out as IDataObject).rules ?? {}) as IDataObject;
			const merged: IDataObject = { ...((rules.groups as IDataObject) ?? {}) };
			for (const key of ['host_groups', 'template_groups']) {
				for (const [flag, value] of Object.entries((rules[key] as IDataObject) ?? {})) {
					merged[flag] = merged[flag] === true || value === true;
				}
				delete rules[key];
			}
			if (Object.keys(merged).length) rules.groups = merged;
		}
		// Before 6.2 a host group also held templates and massupdate required
		// them; keep the templates the groups already have.
		if (m === 'hostgroup.massupdate' && !Array.isArray(out) && (out as IDataObject).templates === undefined) {
			const templates = (await callZabbix.call(this, 'template.get', {
				groupids: idsOf((out as IDataObject).groups, 'groupid'),
				output: ['templateid'],
			})) as IDataObject[];
			(out as IDataObject).templates = templates.map((t) => ({ templateid: t.templateid }));
		}
	}
	return out;
}

/** Give older servers' results the field names a 7.x workflow expects (originals are kept). */
function adaptResult(
	method: string,
	params: IDataObject | unknown[],
	result: unknown,
	version: ZabbixVersion,
): unknown {
	if (!Array.isArray(result)) return result;
	const m = method.toLowerCase();
	const rows = result as IDataObject[];
	if (!atLeast(version, 6, 2) && !Array.isArray(params) && params.selectHostGroups !== undefined) {
		for (const row of rows) if (row.groups !== undefined && row.hostgroups === undefined) row.hostgroups = row.groups;
	}
	if (!atLeast(version, 7, 0)) {
		if (m === 'proxy.get') {
			for (const row of rows) {
				if (row.host !== undefined && row.name === undefined) row.name = row.host;
				if (row.status !== undefined && row.operating_mode === undefined)
					row.operating_mode = String(row.status) === '6' ? '1' : '0';
			}
		}
		if (m === 'host.get') {
			for (const row of rows) {
				if (row.proxy_hostid !== undefined && row.proxyid === undefined) row.proxyid = row.proxy_hostid;
			}
		}
	}
	return result;
}

const AUTH_ERROR = /not authori[sz]ed|session terminated|api token expired|invalid api token/i;
const METHOD_MISSING = /method not found|incorrect api|incorrect method/i;
const NO_PERMISSION = /no permissions to referred object or it does not exist/i;

/** One HTTP round trip. `auth` is omitted for the unauthenticated bootstrap calls. */
async function send(
	this: ZabbixRequestContext,
	credentials: ICredentialDataDecryptedObject,
	method: string,
	params: IDataObject | unknown[],
	auth?: { secret: string; legacyAuth: boolean; version: ZabbixVersion },
): Promise<unknown> {
	const url = `${zabbixBaseUrl(String(credentials.url))}/api_jsonrpc.php`;
	const headers: IDataObject = { ...extraHeaders(credentials), 'Content-Type': 'application/json-rpc' };
	const body: IDataObject = { jsonrpc: '2.0', method, params, id: 1 };
	if (auth?.legacyAuth) body.auth = auth.secret;
	else if (auth) headers.Authorization = `Bearer ${auth.secret}`;

	let response: IZabbixResponse;
	try {
		response = (await this.helpers.httpRequest({
			method: 'POST',
			url,
			headers,
			body,
			json: true,
			skipSslCertificateValidation: credentials.ignoreSslIssues === true,
		})) as IZabbixResponse;
	} catch (error) {
		throw new NodeApiError(this.getNode(), error as JsonObject, {
			message: `Could not reach the Zabbix API at ${url}`,
		});
	}

	if (response?.error) {
		const detail = String(response.error.data ?? '');
		const error = new NodeApiError(this.getNode(), response.error as unknown as JsonObject, {
			message: `${method}: ${response.error.message}`,
			description: detail,
		});
		if (AUTH_ERROR.test(detail)) {
			const passwordAuth = credentials.authentication === 'password';
			error.message = passwordAuth ? 'Zabbix rejected the login' : 'Zabbix rejected the API token';
			error.description = passwordAuth
				? `${detail} Check the username and password, and that the user is enabled and allowed to use the API.`
				: `${detail} Check that the token is valid, not expired, and that its user is enabled.`;
			(error as unknown as IDataObject).authRejected = true;
		} else if (METHOD_MISSING.test(`${response.error.message} ${detail}`)) {
			error.message = `${method} is not available on Zabbix ${auth?.version.text ?? ''}`.trim();
			error.description = `${detail} This object or method was added or removed in another Zabbix version — see "Version compatibility" in the node's README.`;
		} else if (NO_PERMISSION.test(detail)) {
			error.message = `${method}: object not found, or no permission to it`;
			error.description = `${detail} Zabbix gives this same answer when an ID doesn't exist and when the API user can't see the object. Check the ID with a Get Many, then the user's host-group permissions.`;
		}
		throw error;
	}

	if (typeof response !== 'object' || response === null || !('result' in response)) {
		throw new NodeApiError(this.getNode(), { response: String(response).slice(0, 200) } as JsonObject, {
			message: 'The URL did not return a Zabbix API response',
			description: `Check that the credential URL points at the Zabbix frontend (requests go to ${url}).`,
		});
	}

	return response.result;
}

function extraHeaders(credentials: ICredentialDataDecryptedObject): IDataObject {
	const raw = credentials.extraHeaders;
	if (!raw) return {};
	if (typeof raw === 'object') return raw as IDataObject;
	if (!String(raw).trim()) return {};
	try {
		return jsonParse<IDataObject>(String(raw));
	} catch {
		return {};
	}
}

/**
 * Credential test (`testedBy`): detects the version without auth, then makes an
 * authenticated read, through the same code path as every other call.
 */
export async function zabbixCredentialTest(
	this: ICredentialTestFunctions,
	credential: ICredentialsDecrypted,
): Promise<INodeCredentialTestResult> {
	const data = credential.data ?? {};
	// ICredentialTestFunctions exposes no httpRequest helper — request is the only one.
	// eslint-disable-next-line @n8n/community-nodes/no-deprecated-workflow-functions
	const request = this.helpers.request;
	const ctx: ZabbixRequestContext = {
		getCredentials: async () => data,
		getNode: () => ({ name: 'Zabbix credential test' }) as INode,
		helpers: {
			httpRequest: async (o) =>
				await request({
					method: o.method,
					uri: o.url,
					headers: o.headers,
					body: o.body,
					json: true,
					rejectUnauthorized: !o.skipSslCertificateValidation,
				}),
		},
	};
	const key = zabbixBaseUrl(String(data.url ?? ''));
	versionCache.delete(key);
	sessionCache.delete(sessionKey(data));
	try {
		const version = await zabbixVersion.call(ctx);
		await zabbixApiRequest.call(ctx, 'host.get', { output: ['hostid'], limit: 1 });
		const mode = data.readOnly === true ? ' (read-only)' : '';
		return { status: 'OK', message: `Connected to Zabbix ${version.text}${mode}` };
	} catch (error) {
		const { message, description } = error as Error & { description?: string };
		return { status: 'Error', message: description ? `${message}: ${description}` : message };
	}
}

type Shim = (this: ZabbixRequestContext, params: IDataObject) => Promise<unknown>;

/** `[{hostid: "1"}]`, `["1"]` or `"1,2"` → `["1", "2"]`. */
function idsOf(value: unknown, idKey: string): string[] {
	const list = Array.isArray(value) ? value : String(value ?? '').split(',');
	return list
		.map((entry) =>
			typeof entry === 'object' && entry !== null ? (entry as IDataObject)[idKey] : entry,
		)
		.map((id) => String(id ?? '').trim())
		.filter((id) => id !== '');
}

/**
 * `<object>.massupdate` sets the same properties on many objects; from 8.0 the
 * equivalent is one `<object>.update` call carrying an entry per object.
 */
function massUpdateViaUpdate(object: 'host' | 'template'): Shim {
	return async function (params) {
		const listKey = `${object}s`;
		const idKey = `${object}id`;
		const { [listKey]: targets, ...changes } = params;
		// template.massupdate names the templates to link `templates_link`, since
		// `templates` is the target list; template.update calls them `templates`.
		if (object === 'template' && changes.templates_link !== undefined) {
			changes.templates = changes.templates_link;
			delete changes.templates_link;
		}
		const entries = idsOf(targets, idKey).map((id) => ({ [idKey]: id, ...changes }));
		return await callZabbix.call(this, `${object}.update`, entries);
	};
}

/**
 * `<kind>group.massupdate` replaces the members of the given groups. From 8.0 it
 * is rebuilt from massadd (missing members) + massremove (members not listed).
 * Discovered hosts are left alone, as massupdate did. Not atomic: if the
 * removal fails, the additions have already been applied.
 */
function groupMassUpdate(kind: 'host' | 'template'): Shim {
	return async function (params) {
		const groupids = idsOf(params.groups, 'groupid');
		const memberKey = `${kind}s`;
		const memberId = `${kind}id`;
		if (params[memberKey] === undefined) return { groupids };

		const desired = idsOf(params[memberKey], memberId);
		const current = (await callZabbix.call(this, `${kind}.get`, {
			groupids,
			output: kind === 'host' ? [memberId, 'flags'] : [memberId],
		})) as IDataObject[];
		const toRemove = current
			.filter((member) => !desired.includes(String(member[memberId])))
			.filter((member) => String(member.flags ?? '0') !== '4')
			.map((member) => String(member[memberId]));

		if (desired.length) {
			await callZabbix.call(this, `${kind}group.massadd`, {
				groups: groupids.map((groupid) => ({ groupid })),
				[memberKey]: desired.map((id) => ({ [memberId]: id })),
			});
		}
		if (toRemove.length) {
			await callZabbix.call(this, `${kind}group.massremove`, { groupids, [`${kind}ids`]: toRemove });
		}
		return { groupids };
	};
}

const REMOVED_IN_8: Record<string, Shim> = {
	'host.massupdate': massUpdateViaUpdate('host'),
	'template.massupdate': massUpdateViaUpdate('template'),
	'hostgroup.massupdate': groupMassUpdate('host'),
	'templategroup.massupdate': groupMassUpdate('template'),
};
