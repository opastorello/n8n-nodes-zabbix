import type { IDataObject, IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';

import { buildCommonGetParams, getCommonDescription, type IGetCommonOpts } from '../descriptions/getCommon.description';
import type { IZabbixResourceModule } from './interfaces';
import {
	idListToObjects,
	parseJsonParameter,
	removeEmpty,
	toIdArray,
	wrapZabbixResult,
} from './utils';
import { zabbixApiRequest } from '../transport';

/**
 * Singular noun for action labels: lowercased, but all-caps acronyms (SLA,
 * MFA, LLD, HA…) keep their casing, e.g. "MFA Method" → "MFA method".
 */
function noun(displayName: string): string {
	return displayName
		.split(' ')
		.map((word) => (word.length > 1 && word === word.toUpperCase() ? word : word.toLowerCase()))
		.join(' ');
}

/**
 * Indefinite article chosen by pronunciation, not spelling: "an item",
 * "a user" (yoo-), "an SLA" (ess-), "an MFA method" (em-).
 */
function article(nounText: string): string {
	const first = nounText.split(' ')[0];
	if (first.length > 1 && first === first.toUpperCase()) {
		// Acronym read letter-by-letter: vowel-sounding letter names get "an".
		return /^[AEFHILMNORSX]/.test(first) ? 'an' : 'a';
	}
	if (/^(user|uni|eu)/i.test(first)) return 'a';
	return /^[aeiou]/i.test(first) ? 'an' : 'a';
}

/** Pluralize the last word of a noun phrase, keeping acronym casing ("SLA" → "SLAs"). */
function plural(nounText: string): string {
	const words = nounText.split(' ');
	const last = words.pop() as string;
	let pluralized: string;
	if (last.length > 1 && last === last.toUpperCase()) pluralized = `${last}s`;
	else if (/(s|x|z|ch|sh)$/.test(last)) pluralized = `${last}es`;
	else if (/[^aeiou]y$/.test(last)) pluralized = `${last.slice(0, -1)}ies`;
	else pluralized = `${last}s`;
	return [...words, pluralized].join(' ');
}

/**
 * Structured tag input (Add Tag → Tag/Value rows) used instead of raw JSON by
 * every resource whose tags are simple {tag, value} pairs. The handler unwraps
 * the fixedCollection shape ({ tagItems: [...] }) into the array Zabbix expects.
 */
export function tagsField(objectNoun: string): INodeProperties {
	return {
		displayName: 'Tags',
		name: 'tags',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		placeholder: 'Add Tag',
		default: {},
		description: `Tags attached to the ${objectNoun}`,
		options: [
			{
				name: 'tagItems',
				displayName: 'Tag',
				values: [
					{
						displayName: 'Tag',
						name: 'tag',
						type: 'string',
						default: '',
						placeholder: 'e.g. environment',
						description: 'Tag name',
					},
					{
						displayName: 'Value',
						name: 'value',
						type: 'string',
						default: '',
						placeholder: 'e.g. production',
						description: 'Tag value',
					},
				],
			},
		],
	};
}

/**
 * Structured user-macro input (Add Macro → Macro/Value rows), same pattern as
 * `tagsField`. The handler unwraps { macroItems: [...] } into the array Zabbix
 * expects.
 */
export function macrosField(objectNoun: string): INodeProperties {
	return {
		displayName: 'Macros',
		name: 'macros',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		placeholder: 'Add Macro',
		default: {},
		description: `User macros defined on the ${objectNoun}`,
		options: [
			{
				name: 'macroItems',
				displayName: 'Macro',
				values: [
					{
						displayName: 'Macro',
						name: 'macro',
						type: 'string',
						default: '',
						placeholder: '{$MACRO}',
						description: 'Macro name, including the surrounding {$ }',
					},
					{
						displayName: 'Value',
						name: 'value',
						type: 'string',
						default: '',
						description: 'Value of the macro',
					},
				],
			},
		],
	};
}

/**
 * Unwrap fixedCollection values ({ innerName: [...] }) into the plain array a
 * Zabbix API method expects. Leaves strings/arrays untouched.
 */
export function unwrapFixedCollection(value: unknown, innerName: string): unknown {
	if (
		value !== null &&
		typeof value === 'object' &&
		!Array.isArray(value) &&
		Array.isArray((value as IDataObject)[innerName])
	) {
		return (value as IDataObject)[innerName];
	}
	return value;
}

/** An extra id-style filter offered on the Get Many operation. */
export interface ICrudGetFilter {
	name: string;
	displayName: string;
	description: string;
}

/**
 * Maps well-known id-filter parameter names to a dynamic dropdown that loads the
 * real objects from the connected Zabbix instance, so users pick from a list
 * instead of typing IDs. Anything not listed here falls back to a plain text
 * field (used for high-cardinality ids like itemids/eventids).
 */
const ID_FILTER_LOADERS: Record<string, { method: string; label: string }> = {
	groupids: { method: 'getHostGroups', label: 'Host Group' },
	templateids: { method: 'getTemplates', label: 'Template' },
	templategroupids: { method: 'getTemplateGroups', label: 'Template Group' },
	hostids: { method: 'getHosts', label: 'Host' },
	proxyids: { method: 'getProxies', label: 'Proxy' },
	proxy_groupids: { method: 'getProxyGroups', label: 'Proxy Group' },
	usrgrpids: { method: 'getUserGroups', label: 'User Group' },
	userids: { method: 'getUsers', label: 'User' },
	roleids: { method: 'getRoles', label: 'Role' },
};

const EXPRESSION_HINT =
	'Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>';

/**
 * Build a Get-Many id filter: a dynamic dropdown when the parameter is a known
 * object type, otherwise a plain comma-separated text field. Leaving it empty
 * returns everything.
 */
function idFilterField(
	name: string,
	fallbackDisplayName: string,
	description: string,
	displayOptions: INodeProperties['displayOptions'],
): INodeProperties {
	const loader = ID_FILTER_LOADERS[name];
	if (loader) {
		return {
			displayName: `${loader.label} Names or IDs`,
			name,
			type: 'multiOptions',
			typeOptions: { loadOptionsMethod: loader.method },
			default: [],
			hint: 'The list shows the first 1000 entries — for anything beyond that, supply IDs via an expression',
			description: `${description} (leave empty for all). ${EXPRESSION_HINT}.`,
			displayOptions,
		};
	}
	return {
		displayName: fallbackDisplayName,
		name,
		type: 'string',
		default: '',
		description: `${description} (leave empty for all)`,
		displayOptions,
	};
}

export interface ICrudResourceConfig {
	/** Resource value used in the dropdown and displayOptions, e.g. `hostgroup`. */
	resource: string;
	/** Human label, e.g. `Host Group`. */
	displayName: string;
	/** Zabbix API object prefix, e.g. `hostgroup` → `hostgroup.get`. */
	apiObject: string;
	/** Primary id property name, e.g. `groupid`. */
	idField: string;
	/**
	 * Typed fields shared by create and update, declared as collection option
	 * entries. Keys ending in `(JSON)` are parsed; everything else is sent as-is.
	 */
	writeFields: INodeProperties[];
	/** JSON keys within writeFields that must be parsed before sending. */
	jsonWriteKeys?: string[];
	/**
	 * writeFields keys holding a comma-separated id list that Zabbix expects as
	 * an array of objects, e.g. `{ name: 'groups', key: 'groupid' }` turns
	 * `"2,4"` into `[{ groupid: "2" }, { groupid: "4" }]`.
	 */
	relationWriteKeys?: Array<{ name: string; key: string }>;
	/** Extra id filters on Get Many (besides `<idField>s`). */
	getFilters?: ICrudGetFilter[];
	/** `selectX` related-object selectors offered on Get Many. */
	selects?: Array<{ name: string; value: string }>;
	/**
	 * Additional non-CRUD operations for this object (mass add/remove/update,
	 * propagate, replacehostinterfaces, …). Each maps to a Zabbix method and,
	 * when `payload` is `json`, exposes a JSON body field.
	 */
	extraOps?: Array<{
		name: string;
		value: string;
		action: string;
		method: string;
		payload?: 'json' | 'none';
		placeholder?: string;
		description?: string;
	}>;
	/**
	 * Optional final transform applied to the assembled create/update body —
	 * used by resources that need custom value conversion (e.g. maintenance
	 * turning dateTime strings into epoch seconds).
	 */
	transformWriteBody?: (this: IExecuteFunctions, body: IDataObject, itemIndex: number) => IDataObject;
	/** Tune the shared Get Many fields (hide name search / minimal mode). */
	getCommonOpts?: IGetCommonOpts;
}

/**
 * Build a standard four-operation (Create / Get Many / Update / Delete) Zabbix
 * resource module from a small config. Complex objects with required relational
 * create fields (item, trigger, …) are hand-written instead; this covers the
 * many objects whose create body is "a few properties + optional extras".
 */
export function createCrudResource(config: ICrudResourceConfig): IZabbixResourceModule {
	const { resource, displayName, apiObject, idField } = config;
	const idsParam = `${idField}s`;
	const showFor = (operation: string) => ({
		show: { resource: [resource], operation: [operation] },
	});
	const jsonKeys = new Set(config.jsonWriteKeys ?? []);

	const operationSelect: INodeProperties = {
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: [resource] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				action: `Create ${article(noun(displayName))} ${noun(displayName)}`,
				description: `Create a new ${noun(displayName)} in Zabbix`,
			},
			{
				name: 'Delete',
				value: 'delete',
				action: `Delete ${plural(noun(displayName))}`,
				description: `Permanently delete one or more ${plural(noun(displayName))} by ID`,
			},
			{
				name: 'Get Many',
				value: 'getAll',
				action: `Get many ${plural(noun(displayName))}`,
				description: `Retrieve ${plural(noun(displayName))}, with optional filters`,
			},
			...(config.extraOps ?? []).map((op) => ({
				name: op.name,
				value: op.value,
				action: op.action,
				description: op.description ?? op.action,
			})),
			{
				name: 'Update',
				value: 'update',
				action: `Update ${article(noun(displayName))} ${noun(displayName)}`,
				description: `Update an existing ${noun(displayName)} by ID`,
			},
		].sort((a, b) => a.name.localeCompare(b.name)),
		default: 'getAll',
	};

	const extraOpFields: INodeProperties[] = (config.extraOps ?? [])
		.filter((op) => (op.payload ?? 'json') === 'json')
		.map((op) => ({
			displayName: 'Payload (JSON)',
			name: `${op.value}Payload`,
			type: 'json',
			default: '{}',
			placeholder: op.placeholder,
			description: op.description ?? `Parameters for the ${op.method} call`,
			displayOptions: showFor(op.value),
		}));

	const idFieldForUpdate: INodeProperties = {
		displayName: `${displayName} ID`,
		name: idField,
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. 10084',
		description: `ID of the ${noun(displayName)} to update. Find it with a Get Many operation.`,
		displayOptions: showFor('update'),
	};

	// Every CRUD resource gets an escape hatch so any property not surfaced as a
	// typed field can still be sent — guarantees complete coverage of the object.
	const additionalParametersField: INodeProperties = {
		displayName: 'Additional Parameters (JSON)',
		name: 'additionalParameters',
		type: 'json',
		default: '',
		placeholder: '{ "status": 1 }',
		hint: 'Any property from the <a href="https://www.zabbix.com/documentation/current/en/manual/api" target="_blank">Zabbix API docs</a> for this object can be sent here',
		description:
			'Any extra parameters to merge into the request body, as a JSON object. Merged after the typed fields above.',
	};

	// Fields flagged "required on create" in their description surface at the top
	// level (required on Create, optional on Update) so users immediately see
	// what to fill in; everything else lives in the optional collection.
	const isPrimary = (f: INodeProperties) => /required on create/i.test(f.description ?? '');
	const primaryFields = config.writeFields.filter(isPrimary);
	const additionalWriteFields = config.writeFields.filter((f) => !isPrimary(f));

	const primaryFieldProps: INodeProperties[] = primaryFields.flatMap((field) => {
		const cleanDescription = (field.description ?? '').replace(/\s*\(required on create\)/i, '');
		return [
			{ ...field, description: cleanDescription, required: true, displayOptions: showFor('create') },
			{
				...field,
				description: `${cleanDescription} (leave empty to keep unchanged)`.trim(),
				displayOptions: showFor('update'),
			},
		];
	});

	const writeCollection: INodeProperties = {
		displayName: 'Additional Fields',
		name: 'fields',
		type: 'collection',
		placeholder: 'Add field',
		default: {},
		displayOptions: { show: { resource: [resource], operation: ['create', 'update'] } },
		options: [...additionalWriteFields, additionalParametersField],
	};

	const getFilterFields: INodeProperties[] = [
		idFilterField(
			idsParam,
			`${displayName} IDs`,
			`Return only these ${plural(noun(displayName))}`,
			showFor('getAll'),
		),
		...(config.getFilters ?? []).map<INodeProperties>((filter) =>
			idFilterField(filter.name, filter.displayName, filter.description, showFor('getAll')),
		),
	];

	const selectField: INodeProperties[] = config.selects?.length
		? [
				{
					displayName: 'Select Related',
					name: 'selects',
					type: 'multiOptions',
					default: [],
					description: 'Related objects to include with each result',
					options: config.selects,
					displayOptions: showFor('getAll'),
				},
			]
		: [];

	const deleteNotice: INodeProperties = {
		displayName: `This permanently deletes the selected ${plural(noun(displayName))} from Zabbix. This cannot be undone — run Get Many first if you are unsure of the IDs.`,
		name: 'deleteNotice',
		type: 'notice',
		default: '',
		displayOptions: showFor('delete'),
	};

	const deleteField: INodeProperties = {
		displayName: `${displayName} IDs`,
		name: idsParam,
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. 101,102',
		description: `Comma-separated ${noun(displayName)} IDs to delete`,
		displayOptions: showFor('delete'),
	};

	const description: INodeProperties[] = [
		operationSelect,
		idFieldForUpdate,
		...primaryFieldProps,
		writeCollection,
		...getFilterFields,
		...selectField,
		...getCommonDescription(resource, 'getAll', config.getCommonOpts),
		deleteNotice,
		deleteField,
		...extraOpFields,
	];

	const buildWriteBody = function (this: IExecuteFunctions, i: number, isUpdate: boolean): IDataObject {
		const body: IDataObject = {};
		if (isUpdate) body[idField] = this.getNodeParameter(idField, i) as string;

		// Collect top-level primary fields and the "Additional Fields" collection
		// into a single object before applying JSON/relation transforms.
		const parsed: IDataObject = {};
		for (const field of primaryFields) {
			const value = this.getNodeParameter(field.name, i, '');
			if (value !== '' && value !== undefined && !(Array.isArray(value) && value.length === 0)) {
				parsed[field.name] = value;
			}
		}
		Object.assign(parsed, this.getNodeParameter('fields', i, {}) as IDataObject);

		// Tags/macros arrive as fixedCollections ({ tagItems: [...] } /
		// { macroItems: [...] }) — unwrap to the plain arrays Zabbix expects.
		// Empty lists are dropped.
		for (const [key, inner] of [
			['tags', 'tagItems'],
			['macros', 'macroItems'],
		] as const) {
			if (parsed[key] === undefined) continue;
			parsed[key] = unwrapFixedCollection(parsed[key], inner) as IDataObject[] | IDataObject;
			if (
				(Array.isArray(parsed[key]) && (parsed[key] as unknown[]).length === 0) ||
				(typeof parsed[key] === 'object' && !Array.isArray(parsed[key]) && Object.keys(parsed[key] as IDataObject).length === 0)
			) {
				delete parsed[key];
			}
		}

		let extra: IDataObject = {};
		if (parsed.additionalParameters !== undefined && parsed.additionalParameters !== '') {
			extra = parseJsonParameter.call(
				this,
				parsed.additionalParameters,
				'Additional Parameters (JSON)',
				i,
			);
		}
		delete parsed.additionalParameters;

		for (const key of Object.keys(parsed)) {
			if (jsonKeys.has(key) && parsed[key] !== undefined && parsed[key] !== '') {
				parsed[key] = parseJsonParameter.call(this, parsed[key], key, i);
			}
		}
		for (const relation of config.relationWriteKeys ?? []) {
			if (parsed[relation.name] !== undefined && parsed[relation.name] !== '') {
				parsed[relation.name] = idListToObjects(parsed[relation.name], relation.key);
			}
		}
		const assembled = { ...body, ...removeEmpty(parsed), ...extra };
		return config.transformWriteBody ? config.transformWriteBody.call(this, assembled, i) : assembled;
	};

	const handlers: IZabbixResourceModule['handlers'] = {
		async create(this: IExecuteFunctions, i: number): Promise<INodeExecutionData[]> {
			const result = await zabbixApiRequest.call(
				this,
				`${apiObject}.create`,
				buildWriteBody.call(this, i, false),
			);
			return wrapZabbixResult(result, i);
		},

		async update(this: IExecuteFunctions, i: number): Promise<INodeExecutionData[]> {
			const result = await zabbixApiRequest.call(
				this,
				`${apiObject}.update`,
				buildWriteBody.call(this, i, true),
			);
			return wrapZabbixResult(result, i);
		},

		async getAll(this: IExecuteFunctions, i: number): Promise<INodeExecutionData[]> {
			const params = buildCommonGetParams.call(this, i);

			const ids = toIdArray(this.getNodeParameter(idsParam, i, ''));
			if (ids.length) params[idsParam] = ids;

			for (const filter of config.getFilters ?? []) {
				const values = toIdArray(this.getNodeParameter(filter.name, i, ''));
				if (values.length) params[filter.name] = values;
			}

			const selects = this.getNodeParameter('selects', i, []) as string[];
			for (const select of selects) params[select] = 'extend';

			const result = await zabbixApiRequest.call(this, `${apiObject}.get`, params);
			return wrapZabbixResult(result, i);
		},

		async delete(this: IExecuteFunctions, i: number): Promise<INodeExecutionData[]> {
			const ids = toIdArray(this.getNodeParameter(idsParam, i));
			const result = await zabbixApiRequest.call(this, `${apiObject}.delete`, ids);
			return wrapZabbixResult(result, i);
		},
	};

	for (const op of config.extraOps ?? []) {
		handlers[op.value] = async function (this: IExecuteFunctions, i: number): Promise<INodeExecutionData[]> {
			const params =
				(op.payload ?? 'json') === 'json'
					? parseJsonParameter.call(this, this.getNodeParameter(`${op.value}Payload`, i, {}), 'Payload (JSON)', i)
					: {};
			const result = await zabbixApiRequest.call(this, op.method, params);
			return wrapZabbixResult(result, i);
		};
	}

	return { description, handlers };
}

/**
 * Build a Get / Update resource for singleton configuration objects that have
 * no IDs (settings, housekeeping, authentication, autoregistration). Get takes
 * an optional `output`; Update takes a JSON body of properties to change.
 */
export function createConfigResource(config: {
	resource: string;
	displayName: string;
	apiObject: string;
}): IZabbixResourceModule {
	const { resource, displayName, apiObject } = config;

	const description: INodeProperties[] = [
		{
			displayName: 'Operation',
			name: 'operation',
			type: 'options',
			noDataExpression: true,
			displayOptions: { show: { resource: [resource] } },
			options: [
				{
					name: 'Get',
					value: 'get',
					action: `Get ${noun(displayName)}`,
					description: `Retrieve the current ${noun(displayName)} configuration`,
				},
				{
					name: 'Update',
					value: 'update',
					action: `Update ${noun(displayName)}`,
					description: `Change ${noun(displayName)} properties`,
				},
			],
			default: 'get',
		},
		{
			displayName: 'Output',
			name: 'output',
			type: 'string',
			default: 'extend',
			description: 'Properties to return: <code>extend</code> or a comma-separated list',
			displayOptions: { show: { resource: [resource], operation: ['get'] } },
		},
		{
			displayName: 'Parameters (JSON)',
			name: 'updateParams',
			type: 'json',
			default: '{}',
			placeholder: '{ "severity_name_0": "OK" }',
			hint: 'Run Get first to see the available property names, then send only the ones you want to change',
			description: 'Object of properties to update',
			displayOptions: { show: { resource: [resource], operation: ['update'] } },
		},
	];

	const handlers: IZabbixResourceModule['handlers'] = {
		async get(this: IExecuteFunctions, i: number): Promise<INodeExecutionData[]> {
			const output = this.getNodeParameter('output', i, 'extend') as string;
			const params: IDataObject = {
				output: output === 'extend' ? 'extend' : output.split(',').map((v) => v.trim()),
			};
			const result = await zabbixApiRequest.call(this, `${apiObject}.get`, params);
			return wrapZabbixResult(result, i);
		},
		async update(this: IExecuteFunctions, i: number): Promise<INodeExecutionData[]> {
			const params = parseJsonParameter.call(
				this,
				this.getNodeParameter('updateParams', i, {}),
				'Parameters (JSON)',
				i,
			);
			const result = await zabbixApiRequest.call(this, `${apiObject}.update`, params);
			return wrapZabbixResult(result, i);
		},
	};

	return { description, handlers };
}

export interface IGetOnlyResourceConfig {
	resource: string;
	displayName: string;
	apiObject: string;
	idsParam: string;
	getFilters?: ICrudGetFilter[];
	selects?: Array<{ name: string; value: string }>;
	/** Tune the shared Get Many fields (hide name search / minimal mode). */
	getCommonOpts?: IGetCommonOpts;
}

/**
 * Build a single Get Many operation for read-only objects (problem, event,
 * history, alert, audit log, …).
 */
export function createGetOnlyResource(config: IGetOnlyResourceConfig): IZabbixResourceModule {
	const { resource, displayName, apiObject, idsParam } = config;
	const showFor = { show: { resource: [resource], operation: ['getAll'] } };

	const description: INodeProperties[] = [
		{
			displayName: 'Operation',
			name: 'operation',
			type: 'options',
			noDataExpression: true,
			displayOptions: { show: { resource: [resource] } },
			options: [
				{
					name: 'Get Many',
					value: 'getAll',
					action: `Get many ${plural(noun(displayName))}`,
					description: `Retrieve ${plural(noun(displayName))}, with optional filters`,
				},
			],
			default: 'getAll',
		},
		idFilterField(idsParam, `${displayName} IDs`, `Return only these ${plural(noun(displayName))}`, showFor),
		...(config.getFilters ?? []).map<INodeProperties>((filter) =>
			idFilterField(filter.name, filter.displayName, filter.description, showFor),
		),
		...(config.selects?.length
			? [
					{
						displayName: 'Select Related',
						name: 'selects',
						type: 'multiOptions',
						default: [],
						description: 'Related objects to include with each result',
						options: config.selects,
						displayOptions: showFor,
					} as INodeProperties,
				]
			: []),
		...getCommonDescription(resource, 'getAll', config.getCommonOpts),
	];

	const handlers: IZabbixResourceModule['handlers'] = {
		async getAll(this: IExecuteFunctions, i: number): Promise<INodeExecutionData[]> {
			const params = buildCommonGetParams.call(this, i);

			const ids = toIdArray(this.getNodeParameter(idsParam, i, ''));
			if (ids.length) params[idsParam] = ids;

			for (const filter of config.getFilters ?? []) {
				const values = toIdArray(this.getNodeParameter(filter.name, i, ''));
				if (values.length) params[filter.name] = values;
			}

			const selects = this.getNodeParameter('selects', i, []) as string[];
			for (const select of selects) params[select] = 'extend';

			const result = await zabbixApiRequest.call(this, `${apiObject}.get`, params);
			return wrapZabbixResult(result, i);
		},
	};

	return { description, handlers };
}
