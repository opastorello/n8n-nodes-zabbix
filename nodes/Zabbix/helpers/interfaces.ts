import type { IDataObject, IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';

/**
 * A single operation implementation: reads params for one input item and
 * returns the produced execution data. Registered per operation name in a
 * resource module's `handlers` map.
 */
export type ZabbixOperationHandler = (
	this: IExecuteFunctions,
	itemIndex: number,
) => Promise<INodeExecutionData[]>;

/**
 * Contract every resource folder (host, item, …) exposes to the router and to
 * the node's aggregated `properties`.
 */
export interface IZabbixResourceModule {
	description: INodeProperties[];
	handlers: Record<string, ZabbixOperationHandler>;
}

/**
 * Shape of a Zabbix JSON-RPC 2.0 response body.
 * Either `result` (success) or `error` (failure) is present.
 */
export interface IZabbixResponse {
	jsonrpc: '2.0';
	id: number;
	result?: unknown;
	error?: {
		code: number;
		message: string;
		data?: string;
	};
}

/**
 * Parameters shared by every Zabbix `*.get` method.
 * Individual resources add their own id-filters (hostids, groupids, …)
 * and `selectX` sub-object selectors on top of these.
 */
export interface IZabbixGetCommon extends IDataObject {
	output?: string | string[];
	filter?: IDataObject;
	search?: IDataObject;
	searchByAny?: boolean;
	startSearch?: boolean;
	excludeSearch?: boolean;
	searchWildcardsEnabled?: boolean;
	sortfield?: string | string[];
	sortorder?: string | string[];
	limit?: number;
	countOutput?: boolean;
	editable?: boolean;
	preservekeys?: boolean;
}
