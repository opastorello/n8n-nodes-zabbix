import type { IDataObject, ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';

import { zabbixApiRequest } from '../transport';

interface INamedZabbixObject {
	name: string;
	[key: string]: unknown;
}

/** Generic helper: load `<object>.get` and map an id/name pair to dropdown options. */
async function loadNamed(
	ctx: ILoadOptionsFunctions,
	method: string,
	idKey: string,
	nameKey = 'name',
): Promise<INodePropertyOptions[]> {
	const rows = (await zabbixApiRequest.call(ctx, method, {
		output: [idKey, nameKey],
		sortfield: nameKey === 'name' ? 'name' : undefined,
		limit: 1000,
	})) as Array<INamedZabbixObject & Record<string, string>>;

	return rows
		.map((row) => ({ name: String(row[nameKey] ?? row[idKey]), value: String(row[idKey]) }))
		.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getHostGroups(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	return loadNamed(this, 'hostgroup.get', 'groupid');
}

export async function getTemplateGroups(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	return loadNamed(this, 'templategroup.get', 'groupid');
}

export async function getTemplates(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	return loadNamed(this, 'template.get', 'templateid');
}

/** Hosts labelled with their main interface address, so they can be found by IP. */
export async function getHosts(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const rows = (await zabbixApiRequest.call(this, 'host.get', {
		output: ['hostid', 'name'],
		selectInterfaces: ['ip', 'dns', 'main'],
		sortfield: 'name',
		limit: 1000,
	})) as IDataObject[];
	return (Array.isArray(rows) ? rows : [])
		.map((row) => {
			const interfaces = (row.interfaces as IDataObject[]) ?? [];
			const main = interfaces.find((iface) => String(iface.main) === '1') ?? interfaces[0];
			const address = main ? String(main.ip || main.dns || '') : '';
			return { name: address ? `${String(row.name)} (${address})` : String(row.name), value: String(row.hostid) };
		})
		.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getProxies(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	return loadNamed(this, 'proxy.get', 'proxyid');
}

export async function getProxyGroups(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	return loadNamed(this, 'proxygroup.get', 'proxy_groupid');
}

export async function getUserGroups(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	return loadNamed(this, 'usergroup.get', 'usrgrpid');
}

export async function getUsers(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	return loadNamed(this, 'user.get', 'userid', 'username');
}

export async function getRoles(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	return loadNamed(this, 'role.get', 'roleid');
}

/**
 * Load the actual property names of the selected resource, so "Output Fields →
 * Specific Fields" is a checklist instead of a free-text list. Fetches one full
 * object of the current resource and offers its keys. The resource dropdown
 * value equals the Zabbix object name for every CRUD/get resource.
 */
export async function getOutputFields(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	const resource = this.getCurrentNodeParameter('resource') as string;
	if (!resource) return [];
	try {
		const rows = (await zabbixApiRequest.call(this, `${resource}.get`, {
			output: 'extend',
			limit: 1,
		})) as IDataObject[];
		if (Array.isArray(rows) && rows[0]) {
			return Object.keys(rows[0])
				.sort()
				.map((key) => ({ name: key, value: key }));
		}
	} catch {
		// No permission / no objects yet / method has no output — the user can
		// still supply field names through an expression.
	}
	return [];
}

/** Registry of every load-options method, wired into both nodes' `methods.loadOptions`. */
export const loadOptionsMethods = {
	getHostGroups,
	getTemplateGroups,
	getTemplates,
	getHosts,
	getProxies,
	getProxyGroups,
	getUserGroups,
	getUsers,
	getRoles,
	getOutputFields,
};
