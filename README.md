# n8n-nodes-zabbix

An [n8n](https://n8n.io) community node package for the **Zabbix JSON-RPC API** (built and tested against **Zabbix 7.4**). It ships two nodes:

- **Zabbix** — action node with **60 resources / 223 operations** covering the full Zabbix API (hosts, items, triggers, problems, events, templates, maintenances, users, dashboards, scripts, configuration import/export, and more).
- **Zabbix Trigger** — a polling trigger that starts your workflow when a **new problem** or **new event** appears in Zabbix.

Both nodes are marked `usableAsTool`, so an **n8n AI Agent** can call them as tools ("list the disaster-severity problems", "acknowledge event 9001", …).

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
- [Troubleshooting](#troubleshooting)
- [Development](#development)

## Installation

In n8n: **Settings → Community Nodes → Install** and enter `n8n-nodes-zabbix`.

For local development see [Development](#development).

## Credentials

Create a **Zabbix Token API** credential:

| Field | Value |
|---|---|
| **Zabbix URL** | Base URL of the Zabbix frontend, e.g. `https://zabbix.example.com` or `https://example.com/zabbix`. Do **not** include `/api_jsonrpc.php` — it is appended automatically. |
| **API Token** | An API token created in Zabbix under **Users → API tokens** (Zabbix 5.4+). Sent as an `Authorization: Bearer` header. |

Clicking **Save** runs a connection test (a lightweight authenticated `host.get`). A green check means both the URL and the token are valid. An *"Invalid Zabbix API token or URL"* error means the token was rejected.

> **Tip:** create a dedicated Zabbix user with a role limited to what your workflows need, and generate the token for that user. Read-only workflows should use a read-only token.

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
- **Update** asks for the object **ID** plus the same fields as optional ("leave empty to keep unchanged").
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
| **Trigger On** | *New Problem* (`problem.get`) or *New Event* (`event.get`). |
| **Host Group Names or IDs** | Only fire for these groups (empty = all). Loaded live from Zabbix. |
| **Minimum Severity** | Problems only: fire at or above this severity (e.g. *High* fires for High + Disaster). |
| **Additional Filters (JSON)** | Optional raw parameters merged into the poll request (e.g. `{"tags":[{"tag":"env","value":"prod"}]}`). |

**Exactly-once delivery:** the node keeps a watermark on the highest event ID it has seen. The first poll only establishes the watermark (no replay of old problems); each subsequent new problem/event fires exactly once, emitted oldest-first. *Test workflow* (manual run) shows the latest problem so you can build the downstream mapping.

## Using with AI Agents

Both nodes have `usableAsTool: true`. Attach the **Zabbix** node as a tool of an **AI Agent** and the model can query and act on Zabbix by itself:

> *"Which hosts have disaster-severity problems right now? Acknowledge the ones on the staging group."*

The agent will call *Problem → Get Many* (severity filter), *Host → Get Many* and *Event → Acknowledge* as needed. Combine with the **Zabbix Trigger** to build a NOC auto-triage loop: new problem → agent enriches (host, items, history) → decides → acknowledges/runs a script/notifies.

## Example workflows

**1. Alert routing (NOC):**
`Zabbix Trigger (New Problem, severity ≥ High)` → `Slack/Teams/Email` with `{{$json.name}}` and `{{$json.severity}}`.

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

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Credential test fails with *"Invalid Zabbix API token or URL"* | Token revoked/expired/mistyped, or the URL doesn't point at the Zabbix frontend. Confirm `https://<url>/api_jsonrpc.php` answers and regenerate the token under **Users → API tokens**. |
| `Not authorised` / `Session terminated, re-login` on execution | The token was rejected. Rotate it in Zabbix and update the credential. |
| A dropdown ("… Names or IDs") is empty | The token's user can't see those objects (Zabbix permissions), or the connection failed — check the credential test. |
| `Invalid params.` with details | Zabbix rejected a parameter; the error description echoes the API's exact complaint (e.g. a required property missing in a JSON field). Compare with the [Zabbix API docs](https://www.zabbix.com/documentation/current/en/manual/api) for that object. |
| Trigger never fires | It only emits problems/events **newer than the first poll**. Cause a new problem (or lower the severity filter) and wait for the next poll interval. |
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

End-to-end suite against a **disposable** Zabbix 7.4 (creates and deletes real objects — never point it at production):

```bash
docker compose -f test/docker-compose.zabbix.yml up -d   # Zabbix 7.4 at http://localhost:8089 (Admin/zabbix)
# create an API token in the UI (or via user.login + token.create), then:
ZABBIX_TOKEN=<token> npm run test:e2e
```

The e2e suite covers the full lifecycle — host group/host/item/trigger/template create, filtered gets, dynamic dropdowns, tag/macro/interface structured fields, history push+get, mass add, maintenance with time periods, script execute helpers, configuration export, and deletes everything it created.

Architecture notes for contributors live in the repository (resource modules under `nodes/Zabbix/actions/`, one folder per Zabbix object; shared CRUD factory in `helpers/resourceFactory.ts`; JSON-RPC transport in `transport/`).

## Resources

- [Zabbix API documentation](https://www.zabbix.com/documentation/current/en/manual/api)
- [Zabbix API tokens](https://www.zabbix.com/documentation/current/en/manual/web_interface/frontend_sections/users/api_tokens)
- [n8n community nodes](https://docs.n8n.io/integrations/community-nodes/)

## License

[MIT](LICENSE.md)
