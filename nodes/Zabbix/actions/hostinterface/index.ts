import type { IDataObject } from 'n8n-workflow';

import { createCrudResource } from '../../helpers/resourceFactory';

const resourceModule = createCrudResource({
	resource: 'hostinterface',
	displayName: 'Host Interface',
	apiObject: 'hostinterface',
	getCommonOpts: { noNameSearch: true },
	idField: 'interfaceid',
	// Zabbix requires BOTH `ip` and `dns` keys on create (empty string for the
	// unused one), but blank optional fields are normally stripped from the
	// body — so re-add them when creating (update keeps only what was set).
	transformWriteBody(body: IDataObject): IDataObject {
		if (!body.interfaceid) {
			body.ip = body.ip ?? '';
			body.dns = body.dns ?? '';
		}
		return body;
	},
	getFilters: [
		{ name: 'hostids', displayName: 'Host IDs', description: 'Return interfaces of the given hosts' },
	],
	selects: [
		{ name: 'Hosts', value: 'selectHosts' },
		{ name: 'Items', value: 'selectItems' },
	],
	extraOps: [
		{ name: 'Mass Add', value: 'massAdd', action: 'Mass add host interfaces', method: 'hostinterface.massadd', placeholder: '{ "hosts": [{"hostid":"10084"}], "interfaces": [{"type":1,"main":1,"useip":1,"ip":"127.0.0.1","dns":"","port":"10050"}] }' },
		{ name: 'Mass Remove', value: 'massRemove', action: 'Mass remove host interfaces', method: 'hostinterface.massremove', placeholder: '{ "hostids": ["10084"], "interfaces": [{"ip":"127.0.0.1","dns":"","port":"10050"}] }' },
		{ name: 'Replace Host Interfaces', value: 'replaceHostInterfaces', action: 'Replace host interfaces', method: 'hostinterface.replacehostinterfaces', placeholder: '{ "hostid": "10084", "interfaces": [{"type":1,"main":1,"useip":1,"ip":"127.0.0.1","dns":"","port":"10050"}] }' },
	],
	jsonWriteKeys: ['details'],
	writeFields: [
		{
			displayName: 'Host ID',
			name: 'hostid',
			type: 'string',
			default: '',
			description: 'ID of the host the interface belongs to (required on create)',
		},
		{
			displayName: 'Type',
			name: 'type',
			type: 'options',
			default: 1,
			description: 'Interface type',
			options: [
				{ name: 'Agent', value: 1 },
				{ name: 'SNMP', value: 2 },
				{ name: 'IPMI', value: 3 },
				{ name: 'JMX', value: 4 },
			],
		},
		{
			displayName: 'Main',
			name: 'main',
			type: 'options',
			default: 1,
			description: 'Whether this is the default interface of its type on the host',
			options: [
				{ name: 'Yes', value: 1 },
				{ name: 'No', value: 0 },
			],
		},
		{
			displayName: 'Use IP',
			name: 'useip',
			type: 'options',
			default: 1,
			description: 'Whether the connection uses the IP address or the DNS name',
			options: [
				{ name: 'IP', value: 1 },
				{ name: 'DNS', value: 0 },
			],
		},
		{
			displayName: 'IP',
			name: 'ip',
			type: 'string',
			default: '',
			placeholder: '127.0.0.1',
			description: 'IP address of the interface',
		},
		{
			displayName: 'DNS',
			name: 'dns',
			type: 'string',
			default: '',
			description: 'DNS name of the interface',
		},
		{
			displayName: 'Port',
			name: 'port',
			type: 'string',
			default: '',
			placeholder: '10050',
			description: 'Port of the interface',
		},
		{
			displayName: 'Details (JSON)',
			name: 'details',
			type: 'json',
			default: '',
			description: 'Additional SNMP interface details as a JSON object',
		},
	],
});

export const description = resourceModule.description;
export const handlers = resourceModule.handlers;
