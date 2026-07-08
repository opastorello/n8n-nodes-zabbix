import {
	NodeOperationError,
	jsonParse,
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
} from 'n8n-workflow';

/**
 * Wrap a Zabbix `result` payload into n8n execution data.
 * Arrays become one item per element; objects/scalars become a single item.
 */
export function wrapZabbixResult(
	result: unknown,
	itemIndex: number,
): INodeExecutionData[] {
	if (Array.isArray(result)) {
		return result.map((entry) => ({
			json: (typeof entry === 'object' && entry !== null
				? entry
				: { result: entry }) as IDataObject,
			pairedItem: { item: itemIndex },
		}));
	}

	const json =
		typeof result === 'object' && result !== null
			? (result as IDataObject)
			: ({ result } as IDataObject);

	return [{ json, pairedItem: { item: itemIndex } }];
}

/**
 * Read a node parameter that may be provided either as a JSON string or as an
 * already-parsed object, returning a plain object. Empty values yield `{}`.
 */
export function parseJsonParameter(
	this: IExecuteFunctions,
	value: unknown,
	parameterName: string,
	itemIndex: number,
): IDataObject {
	if (value === undefined || value === null || value === '') return {};
	if (typeof value === 'object') return value as IDataObject;

	try {
		return jsonParse<IDataObject>(value as string);
	} catch {
		throw new NodeOperationError(
			this.getNode(),
			`Parameter "${parameterName}" contains invalid JSON`,
			{ itemIndex },
		);
	}
}

/**
 * Convert a comma-separated list of IDs (or an array) into the array-of-objects
 * form Zabbix expects for relation parameters, e.g.
 * `"1,2"` + key `groupid` → `[{ groupid: "1" }, { groupid: "2" }]`.
 */
export function idListToObjects(value: unknown, key: string): IDataObject[] {
	const ids = Array.isArray(value)
		? value.map(String)
		: String(value ?? '')
				.split(',')
				.map((entry) => entry.trim());
	return ids.filter((id) => id !== '').map((id) => ({ [key]: id }));
}

/**
 * Split a comma-separated list (or pass through an array) into a string array,
 * dropping empty entries.
 */
export function toIdArray(value: unknown): string[] {
	const ids = Array.isArray(value)
		? value.map(String)
		: String(value ?? '')
				.split(',')
				.map((entry) => entry.trim());
	return ids.filter((id) => id !== '');
}

/**
 * Remove keys whose value is `undefined`, `null` or an empty string so that
 * optional UI fields left blank are not sent to Zabbix.
 */
export function removeEmpty(input: IDataObject): IDataObject {
	const output: IDataObject = {};
	for (const [key, value] of Object.entries(input)) {
		if (value === undefined || value === null || value === '') continue;
		output[key] = value;
	}
	return output;
}
