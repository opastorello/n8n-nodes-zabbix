# n8n-nodes-zabbix

An [n8n](https://n8n.io) community node package for the **Zabbix JSON-RPC API**, tested live against **Zabbix 7.4** and the **Zabbix 8.0** development branch (see [Version compatibility](#version-compatibility)). It ships two nodes:

- **Zabbix** — action node with **60 resources / 223 operations** covering the full Zabbix API (hosts, items, triggers, problems, events, templates, maintenances, users, dashboards, scripts, configuration import/export, and more).
- **Zabbix Trigger** — a polling trigger that starts your workflow when a **problem opens**, a **problem resolves**, or any **new event** appears in Zabbix.

The **Zabbix** node is marked `usableAsTool`, so an **n8n AI Agent** can call it as a tool ("list the disaster-severity problems", "acknowledge event 9001", …).

## Table of contents

- [Installation](#installation)
- [Credentials](#credentials)
- [The Zabbix node](#the-zabbix-node)
  - [Reading data (Get Many)](#reading-data-get-many)
  - [Creating and updating objects](#creating-and-updating-objects)
  - [Deleting objects](#deleting-objects)
  - [Special operations](#special-operations)
- [The Zabbix Trigger node](#the-zabbix-trigger-node)
- [Using with AI Agents](#using-with-ai-agents)
- [Example workflows](#example-workflows)
- [Resource reference](#resource-reference)
- [Version compatibility](#version-compatibility)
- [Troubleshooting](#troubleshooting)
- [Development](#development)

## Installation

In n8n: **Settings → Community Nodes → Install** and enter `n8n-nodes-zabbix`.

For local development see [Development](#development).

## Credentials

Create a **Zabbix API** credential:

| Field | Value |
|---|---|
| **Zabbix URL** | Base URL of the Zabbix frontend, e.g. `https://zabbix.example.com` or `https://example.com/zabbix`. `/api_jsonrpc.php` is appended automatically (if you paste it anyway, it is ignored). |
| **Authentication** | **API Token** (recommended; Users → API tokens, Zabbix 5.4+) or **Username & Password** (logs in with `user.login`, reuses the session and logs in again when it expires). |
| **Read-Only** | Blocks every method that changes Zabbix (create, update, delete, acknowledge, execute, push, …) inside the node, before anything is sent. Use it for AI-agent tools and reporting workflows. |
| **Extra Headers (JSON)** | Headers sent with every request, for a proxy or **Cloudflare Access** in front of Zabbix, e.g. `{"CF-Access-Client-Id":"…","CF-Access-Client-Secret":"…"}`. |
| **Ignore SSL Issues (Insecure)** | Turn on for an internal Zabbix with a self-signed or private-CA certificate. Leave off otherwise. |

The node detects the Zabbix version once per URL and sends the credential the way that version expects — in the request body before 6.4, as an `Authorization: Bearer` header from 6.4 on (7.2 removed the body field).

Clicking **Save** runs a connection test that reports the version it found (*"Connected to Zabbix 7.4.15 (read-only)"*), or the exact reason it failed.

> **Tip:** create a dedicated Zabbix user with a role limited to what your workflows need. Turn on **Read-Only** for anything an AI agent can call.

## The Zabbix node

Pick a **Resource** (Host, Problem, Item, …) and an **Operation**. Every operation maps 1:1 to a Zabbix API method (e.g. *Host → Get Many* calls `host.get`).

### Reading data (Get Many)

Every *Get Many* operation shares the same friendly filter set — no JSON required:

| Field | What it does |
|---|---|
| **… Names or IDs** (dropdowns) | Multi-select lists loaded live from your Zabbix (host groups, hosts, templates, proxies, users, roles, …). **Leave empty for all**, or pick specific entries. You can also supply IDs with an expression. |
| **Name Contains** | Case-insensitive substring search on the object name. For hosts it matches both the visible *and* the technical name. |
| **Output Fields** | *All Fields* (default), *Count Only* (returns just the number of matches), *IDs Only*, or *Specific Fields* — which reveals a checklist of the object's real property names, **loaded live from your Zabbix**, so you pick fields instead of typing them. |
| **Select Related** | Include related objects with each result (e.g. a host's items, tags, interfaces, templates). |
| **Options → Limit / Sort Field / Sort Order / Editable Only** | Standard paging and sorting. |
| **Options → Advanced Filter (JSON) / Advanced Search (JSON)** | Power-user escape hatches for exact-match filters or extra substring searches. Never required for common cases. |

**Example — all monitored hosts of a group whose name contains "router":**
Resource `Host` → Operation `Get Many` → pick the group in **Host Group Names or IDs** → type `router` in **Name Contains**.

**Cross-object filtering** works the same way everywhere: *Item → Get Many* filtered by **Host**, *Problem → Get Many* filtered by **Host Group**, *Trigger → Get Many* filtered by **Template**, and so on.

### Creating and updating objects

- **Create** shows the **required fields at the top** (marked with `*`). Example: *Host → Create* asks for Technical Name, Group IDs and Interfaces.
- **Update** asks for the object **ID** and sends **only what you fill in**. Text fields from Create appear as optional ("leave empty to keep unchanged"); number/choice fields (e.g. a map's width, an SLA's period) are under **Additional Fields**, so an update never resets them to defaults.
- **Additional Fields** holds every optional typed property.
- **Structured editors instead of JSON** for the common nested inputs:
  - **Host Interfaces** — "Add Interface" rows with Type (Agent/SNMP/IPMI/JMX), Connect Via (the IP or DNS field appears accordingly), Port with the right default, and SNMP details only for SNMP.
  - **Tags** — "Add Tag" rows (Tag/Value) on Host, Item, Trigger, Template, Web Scenario, Connector and Maintenance.
  - **Macros** — "Add Macro" rows ({$MACRO}/Value) on Host and Template.
  - **Maintenance** — date/time pickers for the active window and "Add Time Period" rows (converted to epoch automatically); host groups and hosts are picked from dropdowns.
- **Additional Parameters (JSON)** (inside Additional Fields) lets you send *any* API property that isn't exposed as a typed field — the node never blocks you from using the full API. Remaining deeply nested structures (action operations, dashboard pages, web-scenario steps, …) are JSON, matching the [Zabbix API object formats](https://www.zabbix.com/documentation/current/en/manual/api).

**Example — create a host:**
Resource `Host` → Operation `Create` → Technical Name `web-01`, Group IDs `2` → **Add Interface** → Type *Agent*, Connect Via *IP*, IP `10.0.0.5`. No JSON needed.

### Deleting objects

*Delete* takes a comma-separated list of IDs and removes all of them in one call. **This is irreversible** — test with *Get Many* first to confirm you have the right IDs.

### NOC operations

Built for triage — each one makes several API calls and returns a single result, so an alert, ticket or AI agent gets everything in one step:

- **Problem → Get Context** (by `eventid`) — the problem; the trigger with expanded name and expression, its dependencies and the **last values of its items**; the host with groups, interfaces (availability), tags, inventory and proxy; **maintenance** status; **recurrence** (occurrences in 24 h / 7 d and a verdict: *new*, *recurring* or *chronic*); the host's other events in the last 24 h; acknowledgements; and the link.
- **Host → Get Health Snapshot** — per host: interface availability, open problems by severity and the 5 oldest, items **without data** (older than *Stale After*) and unsupported items with their errors, proxy last-seen and health, maintenance, link.
- **Problem → Get Many** — filters for **minimum severity**, acknowledged, suppressed and recently resolved. Every row gets `hosts` (which `problem.get` can't return by itself), `severity_name`, `event_url`, `since` (ISO), `since_local` (workflow time zone) and `duration_seconds`. **Simplify** returns just `name, severity, severity_name, host, since, duration_seconds, acknowledged, suppressed, tags, url`.
- **Host → Link Templates / Unlink Templates** — *adds* templates (`host.massadd`) without touching the ones already linked; unlink optionally clears what the templates created. Use these instead of **Update**, where the Templates field **replaces** the whole list (the node shows a warning there).
- **Host → Enable / Disable** — for one or many hosts in one call.

### Special operations

Beyond CRUD, the node exposes every extra verb of the API:

- **Event → Acknowledge** — acknowledge/close/comment/change severity on events (actions are combined automatically).
- **Script → Execute / Get Scripts by Hosts / Get Scripts by Events** — run remediation scripts on a host or event.
- **History → Get Many / Push / Clear** and **Trend → Get Many** — read or inject metric data.
- **Configuration → Export / Import / Import Compare** — backup or migrate configuration (JSON/XML/YAML).
- **Host / Template / Host Group / Template Group / Host Interface → Mass \*** — bulk add/remove/update relations; **Propagate** pushes group permissions to subgroups.
- **SLA → Get SLI** — service-level indicator report; **Token → Generate**; **User → Unblock / Provision / Reset TOTP / Logout**; **User Directory → Test**; **Task → Create** (e.g. "check now" for an item).

## The Zabbix Trigger node

Starts a workflow when something new happens in Zabbix (polling — configure the interval on the node's *Settings → Poll Times*).

| Field | What it does |
|---|---|
| **Trigger On** | *New Problem* — a trigger went into problem state (fires even if it already resolved before the poll). *Problem Resolved* — a problem recovered; the original problem is attached. *New Event (Any Source)* — every event, including discovery, autoregistration and internal events. |
| **Host Group Names or IDs** / **Host Names or IDs** | Only fire for these groups / hosts (empty = all). Loaded live from Zabbix. |
| **Minimum Severity** | Problem modes: fire at or above this severity (e.g. *High* fires for High + Disaster). For *Problem Resolved* it applies to the trigger's severity. |
| **Ignore Suppressed** | Skip problems suppressed by a maintenance (hosts in maintenance) or by a manual suppress. |
| **Name Matches / Name Excludes (Regex)** | Only fire for (or skip) event names matching a regular expression; prefix `(?i)` for case-insensitive. |
| **Additional Filters (JSON)** | Optional raw `event.get` parameters merged into the poll request (e.g. `{"tags":[{"tag":"env","value":"prod"}]}`). Invalid JSON stops the trigger with an error instead of being silently ignored. |

Every emitted event is ready to drop into an alert or ticket:

| Field | Content |
|---|---|
| `name`, `severity`, `clock`, `tags`, … | The raw Zabbix event. |
| `hosts` | `[{hostid, host, name}]` of the affected host(s). |
| `severity_name` | *Not classified* … *Disaster* (problem modes). |
| `event_url` | Link to the problem in the Zabbix frontend. |
| `since`, `since_local` | When it happened: ISO (UTC) and in the workflow's time zone. |
| `relatedObject` | The trigger (`triggerid`, `description`, `priority`, `comments`) — problem modes. |
| `problem`, `duration_seconds` | *Problem Resolved* only: the original problem event and how long it lasted. Use `problem.eventid` to find and close the ticket you opened. |

**Exactly-once delivery:** the node keeps a watermark on the highest event ID it has seen and pages forward from it on each poll (up to 1,000 events per poll; a larger burst continues on the next poll — nothing is dropped). The first poll only establishes the watermark (no replay of old problems); each later event fires exactly once, oldest first. *Test workflow* (manual run) shows the latest matching event without moving the watermark.

## Using with AI Agents

The Zabbix node has `usableAsTool: true`. Attach it as a tool of an **AI Agent** and the model can query and act on Zabbix by itself:

> *"Which hosts have disaster-severity problems right now? Acknowledge the ones on the staging group."*

The agent will call *Problem → Get Many* (severity filter), *Host → Get Many* and *Event → Acknowledge* as needed. Prefer **Problem → Get Context** and **Host → Get Health Snapshot** as the agent's tools: one call instead of eight, and far fewer tokens. Use a **Read-Only** credential for agents that should only look.

**Triage workflow with Get Context:**

```
Zabbix Trigger (New Problem, severity ≥ Average, Ignore Suppressed)
  → Zabbix: Problem → Get Context   (Event ID = {{ $json.eventid }})
  → IF {{ $json.recurrence.verdict }} is "chronic"
       true  → Zabbix: Event → Acknowledge ("known chronic issue, see ticket")
       false → AI Agent / Chat message with {{ $json.summary }},
               in maintenance: {{ $json.in_maintenance }},
               last value: {{ $json.trigger.items[0].lastvalue }} {{ $json.trigger.items[0].units }},
               link: {{ $json.url }}
```

## Example workflows

**1. Alert routing (NOC):**
`Zabbix Trigger (New Problem, severity ≥ High)` → `Slack/Teams/Email` with `{{$json.severity_name}}: {{$json.name}} on {{$json.hosts[0].name}}` and a link to `{{$json.event_url}}`.

**1b. Ticket lifecycle:**
`Zabbix Trigger (New Problem)` → create a ticket storing `{{$json.eventid}}`; a second `Zabbix Trigger (Problem Resolved)` → find the ticket by `{{$json.problem.eventid}}` and close it with the downtime `{{$json.duration_seconds}}`.

**2. Auto-acknowledge known noise:**
`Zabbix Trigger (New Problem)` → `IF name contains "ICMP ping loss"` → `Zabbix: Event → Acknowledge` (action *Acknowledge* + *Add Message* "auto-ack: transient link noise").

**3. Daily report:**
`Schedule (08:00)` → `Zabbix: Problem → Get Many` (Output Fields: All) → `Code/AI summarize` → `Email`.

**4. Provisioning from a spreadsheet:**
`Google Sheets` → `Zabbix: Host → Create` (map columns to Technical Name / Group IDs / Interfaces).

**5. Put a host into maintenance from chat:**
`Chat Trigger` → `AI Agent` with Zabbix tool → agent calls *Host → Get Many* (Name Contains) then *Maintenance → Create*.

### Ready-to-import templates

The [`templates/`](templates/) folder has four simple, no-AI workflows you can import (**Workflows → Import from File**) and run after selecting your Zabbix credential:

| File | Flow |
|---|---|
| `daily-problem-digest.json` | Schedule (08:00) → Problem *Get Many* → Code (severity summary) |
| `format-new-problem-alert.json` | Zabbix Trigger (new problem) → Set (formatted alert fields) |
| `auto-acknowledge-disaster.json` | Zabbix Trigger → IF (severity = Disaster) → Event *Acknowledge* |
| `export-hosts-to-csv.json` | Manual → Host *Get Many* (specific fields) → Convert to CSV file |

Each references a credential by the placeholder id `REPLACE_WITH_YOUR_CREDENTIAL_ID`; on first open, just pick your credential from the node's dropdown.

## Resource reference

All 60 resources and their operations (each maps to the same-named `object.method` of the Zabbix API):

| Resource | Operations |
|---|---|
| Action | Create, Delete, Get Many, Update |
| Alert | Get Many |
| API Info | Get Version |
| Audit Log | Get Many |
| Authentication | Get, Update |
| Auto Registration | Get, Update |
| Configuration | Export, Import, Import Compare |
| Connector | Create, Delete, Get Many, Update |
| Correlation | Create, Delete, Get Many, Update |
| Dashboard | Create, Delete, Get Many, Update |
| Discovered Host | Get Many |
| Discovered Service | Get Many |
| Discovery Check | Get Many |
| Discovery Rule | Create, Delete, Get Many, Update |
| Event | Acknowledge, Get Many |
| Global Macro | Create, Delete, Get Many, Update |
| Graph | Create, Delete, Get Many, Update |
| Graph Item | Get Many |
| Graph Prototype | Create, Delete, Get Many, Update |
| HA Node | Get Many |
| History | Clear, Get Many, Push |
| Host | Create, Delete, Get Many, Mass Add, Mass Remove, Mass Update, Update |
| Host Group | Create, Delete, Get Many, Mass Add, Mass Remove, Mass Update, Propagate, Update |
| Host Interface | Create, Delete, Get Many, Mass Add, Mass Remove, Replace Host Interfaces, Update |
| Host Prototype | Create, Delete, Get Many, Update |
| Housekeeping | Get, Update |
| Icon Map | Create, Delete, Get Many, Update |
| Image | Create, Delete, Get Many, Update |
| Item | Create, Delete, Get Many, Update |
| Item Prototype | Create, Delete, Get Many, Update |
| LLD Rule | Create, Delete, Get Many, Update |
| LLD Rule Prototype | Create, Delete, Get Many, Update |
| Maintenance | Create, Delete, Get Many, Update |
| Map | Create, Delete, Get Many, Update |
| Media Type | Create, Delete, Get Many, Update |
| MFA Method | Create, Delete, Get Many, Update |
| Module | Create, Delete, Get Many, Update |
| Problem | Get Many |
| Proxy | Create, Delete, Get Many, Update |
| Proxy Group | Create, Delete, Get Many, Update |
| Regular Expression | Create, Delete, Get Many, Update |
| Role | Create, Delete, Get Many, Update |
| Scheduled Report | Create, Delete, Get Many, Update |
| Script | Create, Delete, Execute, Get Many, Get Scripts by Events, Get Scripts by Hosts, Update |
| Service | Create, Delete, Get Many, Update |
| Settings | Get, Update |
| SLA | Create, Delete, Get Many, Get SLI, Update |
| Task | Create, Get Many |
| Template | Create, Delete, Get Many, Mass Add, Mass Remove, Mass Update, Update |
| Template Dashboard | Create, Delete, Get Many, Update |
| Template Group | Create, Delete, Get Many, Mass Add, Mass Remove, Mass Update, Propagate, Update |
| Token | Create, Delete, Generate, Get Many, Update |
| Trend | Get Many |
| Trigger | Create, Delete, Get Many, Update |
| Trigger Prototype | Create, Delete, Get Many, Update |
| User | Create, Delete, Get Many, Logout, Provision, Reset TOTP, Unblock, Update |
| User Directory | Create, Delete, Get Many, Test, Update |
| User Group | Create, Delete, Get Many, Update |
| Value Map | Create, Delete, Get Many, Update |
| Web Scenario | Create, Delete, Get Many, Update |

Method coverage vs the Zabbix 7.4 specification: **223 of 226** methods are exposed as typed operations. The remaining 3 are intentional: `user.login` (replaced by the token credential) and host-level `usermacro.create/update/delete` (managed through the **Host** resource's Macros field; the **Global Macro** resource covers the global variants).

## Version compatibility

| Zabbix | Status |
|---|---|
| **7.0 LTS, 7.2, 7.4** | Fully supported; all live suites pass (7.0 and 7.4 in CI). On 7.0/7.2 the two Discovery Rule Prototype operations report *"not available on Zabbix 7.x"* — that object was added in 7.4. |
| **8.0** (development branch, reports `8.0.0`) | All live suites pass, in CI too. 8.0 is not released yet, so its API can still change. |
| 6.0 / 6.4 | Best effort, not in CI. Connecting works (the token goes in the request body before 6.4) and the common CRUD, problem and host operations pass; objects added in 6.2+/7.0+ report *"not available"*. The Zabbix Trigger is not validated on 6.x. |

When a method doesn't exist on your version, the node says so — *"templategroup.create is not available on Zabbix 6.0.48"* — instead of a bare "Method not found".

What changes on 8.0 and how the node handles it:

- **`host`, `template`, `hostgroup` and `templategroup.massupdate` were removed.** The node detects 8.0 (one `apiinfo.version` call per Zabbix URL) and rebuilds them, so the **Mass Update** operations — and a **Custom API Call** to those methods — keep working with the same result. Host/template mass update becomes a single `update` call; host/template group mass update becomes a `massadd` followed by a `massremove`, which is **not atomic** (if the removal fails, the additions stay).
- **`history.push` requires the item's *Allowed hosts*** (`trapper_hosts`) to include the Zabbix frontend's IP; otherwise every value is rejected with *"Client IP is not in item's allowed hosts list."*.
- **New 8.0 objects** (`apmtrace`, `apmspan`, `apmlog`, `apmmetric`, `ceprule`, `device`, `serverinfo`) are reachable through **Custom API Call**. Typed resources for them will follow once 8.0 is released and the API is final.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| *"history.push rejected … Client IP is not in item's allowed hosts list"* | Zabbix 8.0 enforces the trapper item's **Allowed hosts** for API pushes. Add the frontend's IP (or `0.0.0.0/0`) to the item's `trapper_hosts`. |
| Credential test fails with *"Invalid Zabbix API token or URL"* | Token revoked/expired/mistyped, or the URL doesn't point at the Zabbix frontend. Confirm `https://<url>/api_jsonrpc.php` answers and regenerate the token under **Users → API tokens**. |
| `Not authorised` / `Session terminated, re-login` on execution | The token was rejected. Rotate it in Zabbix and update the credential. |
| A dropdown ("… Names or IDs") is empty | The token's user can't see those objects (Zabbix permissions), or the connection failed — check the credential test. |
| `Invalid params.` with details | Zabbix rejected a parameter; the error description echoes the API's exact complaint (e.g. a required property missing in a JSON field). Compare with the [Zabbix API docs](https://www.zabbix.com/documentation/current/en/manual/api) for that object. |
| Trigger never fires | It only emits problems/events **newer than the first poll**. Cause a new problem (or lower the severity filter) and wait for the next poll interval. |
| *"Could not reach the Zabbix API"* with `self signed certificate` / `unable to verify the first certificate` | The Zabbix frontend uses a self-signed or private-CA certificate. Turn on **Ignore SSL Issues** in the credential. |
| *"The URL did not return a Zabbix API response"* | The URL answers but isn't the Zabbix frontend (e.g. a login portal or a proxy page). Point it at the directory that contains `api_jsonrpc.php`. |
| `apiinfo.version` errors about the authorization header | Fixed in this node (the version call is sent unauthenticated, as Zabbix requires). Update the package if you see this. |

## Development

```bash
npm install
npm run dev     # builds + launches a local n8n at http://localhost:5678 with hot reload
npm run lint    # n8n community-node linter
npm run build   # compile to dist/
```

### Testing

```bash
npm run build && npm run test:smoke   # all 223 operations against a mocked transport (no server needed)
```

End-to-end suites against a **disposable** Zabbix (they create and delete real objects and refuse non-local URLs — never point them at production):

```bash
docker compose -f test/docker-compose.zabbix.yml up -d   # Zabbix 7.4 at http://localhost:8089 (Admin/zabbix)
export ZABBIX_URL=http://127.0.0.1:8089
export ZABBIX_TOKEN=$(npm run -s test:token -- $ZABBIX_URL)   # waits for Zabbix, logs in as Admin, prints a token
npm run test:e2e           # write lifecycle
npm run test:e2e:full      # every operation
npm run test:e2e:trigger   # polling trigger: problem → resolved, exactly-once
npm run test:e2e:compat    # *.massupdate gives the same result on 7.4 and 8.0
```

Another version side by side, e.g. the 8.0 development branch on port 8090:

```bash
ZABBIX_TAG=alpine-trunk ZABBIX_WEB_PORT=8090 ZABBIX_SERVER_PORT=10152 \
  docker compose -p zabbix-node-test-trunk -f test/docker-compose.zabbix.yml up -d
```

CI (`.github/workflows/e2e.yml`) runs all four suites against 7.4 and the development branch on every PR and weekly.

The e2e suite covers the full lifecycle — host group/host/item/trigger/template create, filtered gets, dynamic dropdowns, tag/macro/interface structured fields, history push+get, mass add, maintenance with time periods, script execute helpers, configuration export, and deletes everything it created.

Architecture notes for contributors live in the repository (resource modules under `nodes/Zabbix/actions/`, one folder per Zabbix object; shared CRUD factory in `helpers/resourceFactory.ts`; JSON-RPC transport in `transport/`).

## Resources

- [Zabbix API documentation](https://www.zabbix.com/documentation/current/en/manual/api)
- [Zabbix API tokens](https://www.zabbix.com/documentation/current/en/manual/web_interface/frontend_sections/users/api_tokens)
- [n8n community nodes](https://docs.n8n.io/integrations/community-nodes/)

## License

[MIT](LICENSE.md)
