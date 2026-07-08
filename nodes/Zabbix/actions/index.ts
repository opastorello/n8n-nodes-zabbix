import type { INodePropertyOptions } from 'n8n-workflow';

import type { IZabbixResourceModule } from '../helpers/interfaces';
import * as action from './action';
import * as alert from './alert';
import * as apiinfo from './apiinfo';
import * as auditlog from './auditlog';
import * as authentication from './authentication';
import * as autoregistration from './autoregistration';
import * as configuration from './configuration';
import * as connector from './connector';
import * as correlation from './correlation';
import * as dashboard from './dashboard';
import * as dcheck from './dcheck';
import * as dhost from './dhost';
import * as discoveryrule from './discoveryrule';
import * as discoveryruleprototype from './discoveryruleprototype';
import * as drule from './drule';
import * as dservice from './dservice';
import * as event from './event';
import * as graph from './graph';
import * as graphitem from './graphitem';
import * as graphprototype from './graphprototype';
import * as hanode from './hanode';
import * as history from './history';
import * as host from './host';
import * as hostgroup from './hostgroup';
import * as hostinterface from './hostinterface';
import * as hostprototype from './hostprototype';
import * as housekeeping from './housekeeping';
import * as httptest from './httptest';
import * as iconmap from './iconmap';
import * as image from './image';
import * as item from './item';
import * as itemprototype from './itemprototype';
import * as maintenance from './maintenance';
import * as map from './map';
import * as mediatype from './mediatype';
import * as mfa from './mfa';
import * as moduleResource from './module';
import * as problem from './problem';
import * as proxy from './proxy';
import * as proxygroup from './proxygroup';
import * as regexp from './regexp';
import * as report from './report';
import * as role from './role';
import * as script from './script';
import * as service from './service';
import * as settings from './settings';
import * as sla from './sla';
import * as task from './task';
import * as template from './template';
import * as templatedashboard from './templatedashboard';
import * as templategroup from './templategroup';
import * as token from './token';
import * as trend from './trend';
import * as trigger from './trigger';
import * as triggerprototype from './triggerprototype';
import * as user from './user';
import * as userdirectory from './userdirectory';
import * as usergroup from './usergroup';
import * as usermacro from './usermacro';
import * as valuemap from './valuemap';

/**
 * Central registry of every Zabbix resource module.
 *
 * To add a resource: create `actions/<name>/index.ts` exporting `description`
 * and `handlers`, then register it here and add a `resourceOptions` entry. The
 * resource dropdown, aggregated node properties and router all derive from this.
 */
export const resources: Record<string, IZabbixResourceModule> = {
	action,
	alert,
	apiinfo,
	auditlog,
	authentication,
	autoregistration,
	configuration,
	connector,
	correlation,
	dashboard,
	dcheck,
	dhost,
	discoveryrule,
	discoveryruleprototype,
	drule,
	dservice,
	event,
	graph,
	graphitem,
	graphprototype,
	hanode,
	history,
	host,
	hostgroup,
	hostinterface,
	hostprototype,
	housekeeping,
	httptest,
	iconmap,
	image,
	item,
	itemprototype,
	maintenance,
	map,
	mediatype,
	mfa,
	module: moduleResource,
	problem,
	proxy,
	proxygroup,
	regexp,
	report,
	role,
	script,
	service,
	settings,
	sla,
	task,
	template,
	templatedashboard,
	templategroup,
	token,
	trend,
	trigger,
	triggerprototype,
	user,
	userdirectory,
	usergroup,
	usermacro,
	valuemap,
};

/** Options shown in the node's "Resource" dropdown, ordered alphabetically by label. */
export const resourceOptions: INodePropertyOptions[] = [
	{ name: 'Action', value: 'action', description: 'Automation rules that react to events (send notifications, run remediation)' },
	{ name: 'Alert', value: 'alert', description: 'Notifications that Zabbix has already generated for events (read-only)' },
	{ name: 'API Info', value: 'apiinfo', description: 'Version of the Zabbix API — useful as a connectivity check' },
	{ name: 'Audit Log', value: 'auditlog', description: 'Records of configuration changes made by users (read-only)' },
	{ name: 'Authentication', value: 'authentication', description: 'Global authentication settings (HTTP, LDAP, SAML)' },
	{ name: 'Auto Registration', value: 'autoregistration', description: 'Settings for automatic registration of active agents' },
	{ name: 'Configuration', value: 'configuration', description: 'Export or import configuration (hosts, templates…) as JSON/XML/YAML' },
	{ name: 'Connector', value: 'connector', description: 'Streaming connectors that push item values or events to external systems' },
	{ name: 'Correlation', value: 'correlation', description: 'Event correlation rules that close related problems automatically' },
	{ name: 'Dashboard', value: 'dashboard', description: 'Frontend dashboards and their widget pages' },
	{ name: 'Discovered Host', value: 'dhost', description: 'Hosts found by network discovery (read-only)' },
	{ name: 'Discovered Service', value: 'dservice', description: 'Services found by network discovery, e.g. open ports (read-only)' },
	{ name: 'Discovery Check', value: 'dcheck', description: 'Individual checks belonging to a network discovery rule (read-only)' },
	{ name: 'Discovery Rule', value: 'drule', description: 'Network discovery rules that scan IP ranges for hosts' },
	{ name: 'Event', value: 'event', description: 'Problem and recovery events — retrieve or acknowledge them' },
	{ name: 'Global Macro', value: 'usermacro', description: 'Global {$MACRO} user macros available to all hosts' },
	{ name: 'Graph', value: 'graph', description: 'Custom graphs configured for host items' },
	{ name: 'Graph Item', value: 'graphitem', description: 'The individual items plotted inside graphs (read-only)' },
	{ name: 'Graph Prototype', value: 'graphprototype', description: 'Graph templates created by low-level discovery' },
	{ name: 'HA Node', value: 'hanode', description: 'Zabbix server high-availability cluster nodes (read-only)' },
	{ name: 'History', value: 'history', description: 'Raw collected item values — read, push or clear them' },
	{ name: 'Host', value: 'host', description: 'Monitored devices/servers — the core object of Zabbix' },
	{ name: 'Host Group', value: 'hostgroup', description: 'Logical groups that organize hosts and drive permissions' },
	{ name: 'Host Interface', value: 'hostinterface', description: 'Agent/SNMP/IPMI/JMX interfaces used to reach a host' },
	{ name: 'Host Prototype', value: 'hostprototype', description: 'Host blueprints created by low-level discovery (e.g. VMs)' },
	{ name: 'Housekeeping', value: 'housekeeping', description: 'Data retention settings (how long history/trends/events are kept)' },
	{ name: 'Icon Map', value: 'iconmap', description: 'Rules that pick map icons based on host inventory' },
	{ name: 'Image', value: 'image', description: 'Icons and background images used on maps' },
	{ name: 'Item', value: 'item', description: 'Metrics collected from hosts (CPU, memory, custom checks…)' },
	{ name: 'Item Prototype', value: 'itemprototype', description: 'Item blueprints created by low-level discovery (e.g. per-disk metrics)' },
	{ name: 'LLD Rule', value: 'discoveryrule', description: 'Low-level discovery rules that find entities on a host (disks, NICs…)' },
	{ name: 'LLD Rule Prototype', value: 'discoveryruleprototype', description: 'Nested LLD rules created by another LLD rule' },
	{ name: 'Maintenance', value: 'maintenance', description: 'Maintenance windows that suppress alerting for hosts/groups' },
	{ name: 'Map', value: 'map', description: 'Network maps shown in the frontend' },
	{ name: 'Media Type', value: 'mediatype', description: 'Notification channels (email, SMS, webhooks, scripts)' },
	{ name: 'MFA Method', value: 'mfa', description: 'Multi-factor authentication methods (TOTP, Duo)' },
	{ name: 'Module', value: 'module', description: 'Frontend UI modules' },
	{ name: 'Problem', value: 'problem', description: 'Currently open problems (read-only) — the "what is wrong now" view' },
	{ name: 'Proxy', value: 'proxy', description: 'Zabbix proxies that collect data on behalf of the server' },
	{ name: 'Proxy Group', value: 'proxygroup', description: 'Groups of proxies with automatic failover' },
	{ name: 'Regular Expression', value: 'regexp', description: 'Global regular expressions reusable across the configuration' },
	{ name: 'Role', value: 'role', description: 'User roles that define frontend and API permissions' },
	{ name: 'Scheduled Report', value: 'report', description: 'PDF dashboard reports emailed on a schedule' },
	{ name: 'Script', value: 'script', description: 'Global scripts — run remediation commands on hosts or events' },
	{ name: 'Service', value: 'service', description: 'Business services used for SLA monitoring' },
	{ name: 'Settings', value: 'settings', description: 'Global frontend/server settings' },
	{ name: 'SLA', value: 'sla', description: 'Service-level agreements and their compliance (SLI) reports' },
	{ name: 'Task', value: 'task', description: 'Server tasks, e.g. "check now" for an item or LLD rule' },
	{ name: 'Template', value: 'template', description: 'Reusable monitoring templates linked to hosts' },
	{ name: 'Template Dashboard', value: 'templatedashboard', description: 'Dashboards that belong to a template' },
	{ name: 'Template Group', value: 'templategroup', description: 'Logical groups that organize templates' },
	{ name: 'Token', value: 'token', description: 'API tokens used to authenticate with this API' },
	{ name: 'Trend', value: 'trend', description: 'Hourly aggregated item values (min/avg/max, read-only)' },
	{ name: 'Trigger', value: 'trigger', description: 'Problem definitions — expressions that fire when item values are bad' },
	{ name: 'Trigger Prototype', value: 'triggerprototype', description: 'Trigger blueprints created by low-level discovery' },
	{ name: 'User', value: 'user', description: 'Zabbix user accounts' },
	{ name: 'User Directory', value: 'userdirectory', description: 'LDAP/SAML directories for user provisioning' },
	{ name: 'User Group', value: 'usergroup', description: 'User groups that drive host-group permissions' },
	{ name: 'Value Map', value: 'valuemap', description: 'Mappings that translate raw values into readable labels (0 → "Down")' },
	{ name: 'Web Scenario', value: 'httptest', description: 'HTTP checks that monitor websites step by step' },
];
