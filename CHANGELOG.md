# Changelog

## 0.3.1

- Release pipeline: publish through npm trusted publishing (OIDC). Same contents as 0.3.0.

## 0.3.0

### Added
- **Zabbix Webhook Trigger** node: registers (and on deactivation disables) a webhook media type in Zabbix and starts the workflow on each alert — problem, recovery or acknowledge/update — with a shared secret, event and severity filters.
- **Media Type → Create Webhook Media Type**.
- **Event → Who Gets Notified**: which enabled actions match an event and who they notify on problem, acknowledge and recovery.
- **Item → Get History** (value type detected per item, trends for long windows) and **Item → Get Graph Image** (PNG; needs a username/password credential).
- **Host → Set Tags / Set Macros** with explicit Merge / Replace / Remove, **Get Site Summary**, **Dry Run** on bulk host operations, hosts selectable by interface IP.
- Zabbix Trigger: **Suppress Repeats** window against flapping problems.
- Severity fields accept names (`average`, `High`) as well as numbers.

### Tested
- New live suite (`test:e2e:noc`) passes on Zabbix 7.0 and 7.4, including a real webhook delivery from Zabbix to the node.

## 0.2.0

### Added
- **Problem → Get Context**: one result per problem with the trigger (expanded name and expression, dependencies, last item values), host (groups, interfaces, tags, inventory, proxy), maintenance status, recurrence in 24 h / 7 d with a new / recurring / chronic verdict, the host's recent events and a link.
- **Host → Get Health Snapshot**: interface availability, open problems by severity, items without data or unsupported, proxy health and maintenance.
- **Host → Link Templates / Unlink Templates** (additive — never replaces the linked list), **Enable** and **Disable**.
- **Problem → Get Many**: minimum severity, acknowledged, suppressed and recently-resolved filters; every row includes hosts, `severity_name`, `event_url`, local time and duration; **Simplify** mode.
- **Zabbix Trigger**: *Problem Resolved* mode (with the original problem and duration), *Ignore Suppressed*, host filter, name include/exclude regex; events carry hosts, severity name, link and local time.
- **Credential**: username/password login, **Read-Only** switch, extra headers (Cloudflare Access), ignore SSL; the connection test reports the Zabbix version.
- Works across Zabbix versions: token placement before 6.4, the `*.massupdate` methods removed in 8.0 are rebuilt, clear "not available on Zabbix X" errors.

### Fixed
- Update no longer resets number/option fields to their defaults (graph, graph prototype, map, SLA).
- Event → Acknowledge sends the new severity and the suppression end time.
- The trigger applies Additional Filters (JSON) and no longer drops events in large bursts.
- *history.push* errors show the reason (e.g. the item's Allowed hosts on Zabbix 8.0).

### Tested
- Live suites pass on Zabbix 7.0, 7.2, 7.4 and the 8.0 development branch; CI runs them on 7.0, 7.4 and 8.0.

## 0.1.0

- Initial release: 60 resources / 223 operations of the Zabbix API and a polling trigger.
