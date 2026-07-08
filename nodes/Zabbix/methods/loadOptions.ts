import type { ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';

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

export async function getHosts(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	return loadNamed(this, 'host.get', 'hostid');
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
};
