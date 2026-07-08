import type { IDataObject, IExecuteFunctions, INodeProperties } from 'n8n-workflow';

import { parseJsonParameter, removeEmpty } from '../helpers/utils';

/**
 * Per-resource tuning of the common Get Many fields, so the UI never offers a
 * control the underlying API method would reject.
 */
export interface IGetCommonOpts {
	/**
	 * Hide the "Name Contains" search — for objects that have no `name`
	 * property (history values, trends, alerts, audit records, …).
	 */
	noNameSearch?: boolean;
	/**
	 * Strip everything the method doesn't support (e.g. `trend.get`, which only
	 * accepts output/limit/countOutput): no name search, no advanced
	 * filter/search, no sorting, no editable flag.
	 */
	minimal?: boolean;
}

/**
 * Common parameters accepted by every Zabbix `*.get` method.
 *
 * The everyday filters are friendly typed fields (a "Name" contains-search and,
 * where available, dynamic dropdowns declared per resource). Raw JSON filters
 * are still available but tucked away as advanced options so users never have to
 * write JSON for the common cases.
 */
export function getCommonDescription(
	resource: string,
	operation = 'getAll',
	opts: IGetCommonOpts = {},
): INodeProperties[] {
	const show = { resource: [resource], operation: [operation] };
	const hideNameSearch = opts.noNameSearch || opts.minimal;

	const nameSearchField: INodeProperties[] = hideNameSearch
		? []
		: [
				{
					displayName: 'Name Contains',
					name: 'nameSearch',
					type: 'string',
					default: '',
					placeholder: 'e.g. web-server',
					description:
						'Return only results whose name contains this text (case-insensitive). Leave empty to return all.',
					displayOptions: { show },
				},
			];

	return [
		...nameSearchField,
		{
			displayName: 'Output Fields',
			name: 'output',
			type: 'options',
			default: 'extend',
			description: 'Which fields to return for each result',
			options: [
				{ name: 'All Fields', value: 'extend', description: 'Return every property of each result' },
				{ name: 'Count Only', value: 'count', description: 'Return just the number of matching results' },
				{ name: 'IDs Only', value: 'shorten', description: 'Return only the ID of each result' },
				{ name: 'Specific Fields', value: 'specific', description: 'Pick exactly which fields to return from a list' },
			],
			displayOptions: { show },
		},
		{
			displayName: 'Field Names or IDs',
			name: 'outputSpecific',
			type: 'multiOptions',
			typeOptions: { loadOptionsMethod: 'getOutputFields' },
			default: [],
			description:
				'The fields to return, loaded from your Zabbix. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			displayOptions: { show: { ...show, output: ['specific'] } },
		},
		{
			displayName: 'Options',
			name: 'options',
			type: 'collection',
			placeholder: 'Add option',
			default: {},
			displayOptions: { show },
			options: [
				...(opts.minimal
					? []
					: [
							{
								displayName: 'Advanced Filter (JSON)',
								name: 'filterJson',
								type: 'json',
								default: '',
								placeholder: '{ "status": "0" }',
								description:
									'Advanced: return only results that exactly match these property/value pairs. For power users; most cases are covered by the fields above.',
							} as INodeProperties,
							{
								displayName: 'Advanced Search (JSON)',
								name: 'searchJson',
								type: 'json',
								default: '',
								placeholder: '{ "key_": "system.cpu" }',
								description:
									'Advanced: substring-match on additional string properties' +
									(hideNameSearch ? '' : ', beyond the Name field above'),
							} as INodeProperties,
						]),
				...(opts.minimal
					? []
					: [
							{
								displayName: 'Editable Only',
								name: 'editable',
								type: 'boolean',
								default: false,
								description: 'Whether to return only objects the user has write permission to',
							} as INodeProperties,
						]),
				{
					displayName: 'Limit',
					name: 'limit',
					type: 'number',
					typeOptions: { minValue: 1 },
					default: 50,
					description: 'Max number of results to return',
				},
				...(opts.minimal
					? []
					: [
							{
								displayName: 'Sort Field',
								name: 'sortfield',
								type: 'string',
								default: '',
								placeholder: 'name',
								description: 'Comma-separated properties to sort the result by',
							} as INodeProperties,
							{
								displayName: 'Sort Order',
								name: 'sortorder',
								type: 'options',
								options: [
									{ name: 'Ascending', value: 'ASC', description: 'Sort A→Z / smallest first' },
									{ name: 'Descending', value: 'DESC', description: 'Sort Z→A / largest first' },
								],
								default: 'ASC',
								description: 'Sort direction applied to the sort field(s)',
							} as INodeProperties,
						]),
			],
		},
	];
}

/**
 * Read the common `*.get` UI fields for the current item and assemble them into
 * a Zabbix `params` object.
 */
export function buildCommonGetParams(this: IExecuteFunctions, itemIndex: number): IDataObject {
	const params: IDataObject = {};
	const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;

	// Output selection.
	const output = this.getNodeParameter('output', itemIndex, 'extend') as string;
	if (output === 'count') {
		params.countOutput = true;
	} else if (output === 'shorten') {
		params.output = 'shorten';
	} else if (output === 'specific') {
		const fields = this.getNodeParameter('outputSpecific', itemIndex, []) as string[];
		params.output = fields.length ? fields : 'extend';
	} else {
		params.output = 'extend';
	}

	// Friendly name search.
	const name = this.getNodeParameter('nameSearch', itemIndex, '') as string;
	const search: IDataObject = {};
	if (name) search.name = name;

	// Advanced JSON search merges on top of the name search.
	const searchJson = parseJsonParameter.call(
		this,
		options.searchJson ?? '',
		'Advanced Search (JSON)',
		itemIndex,
	);
	Object.assign(search, searchJson);
	// Default Zabbix search is a case-insensitive substring match ("contains"),
	// which is exactly what users expect. (Enabling wildcards would instead
	// require an exact match unless the user adds `*`.)
	if (Object.keys(search).length) params.search = search;

	// Advanced JSON filter.
	const filterJson = parseJsonParameter.call(
		this,
		options.filterJson ?? '',
		'Advanced Filter (JSON)',
		itemIndex,
	);
	if (Object.keys(filterJson).length) params.filter = filterJson;

	// Remaining options.
	const rest: IDataObject = {};
	if (options.limit !== undefined) rest.limit = options.limit;
	if (options.editable) rest.editable = options.editable;
	if (typeof options.sortfield === 'string' && options.sortfield) {
		rest.sortfield = options.sortfield.split(',').map((v) => v.trim());
		rest.sortorder = options.sortorder ?? 'ASC';
	}

	return { ...params, ...removeEmpty(rest) };
}
