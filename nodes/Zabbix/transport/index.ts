import type {
	IExecuteFunctions,
	IHookFunctions,
	ILoadOptionsFunctions,
	IPollFunctions,
	IDataObject,
	IHttpRequestOptions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

import type { IZabbixResponse } from '../helpers/interfaces';

type ZabbixRequestContext =
	| IExecuteFunctions
	| IHookFunctions
	| ILoadOptionsFunctions
	| IPollFunctions;

/**
 * Send a prepared JSON-RPC request. Kept separate from `zabbixApiRequest` (which
 * retrieves the credential) so the HTTP call itself doesn't mix credential
 * retrieval with the request — the `Authorization` header is assembled by the
 * caller. The Zabbix token is a static Bearer token that we attach directly,
 * which also avoids n8n's generic-auth "Custom API Call" being injected into
 * every resource.
 */
async function sendJsonRpc(
	ctx: ZabbixRequestContext,
	options: IHttpRequestOptions,
): Promise<IZabbixResponse> {
	return (await ctx.helpers.httpRequest(options)) as IZabbixResponse;
}

/**
 * Perform a single Zabbix JSON-RPC 2.0 call.
 *
 * Every Zabbix API method is an HTTP POST to `{url}/api_jsonrpc.php` with the
 * method name carried in the body. The `zabbixTokenApi` credential's API token
 * is attached as an `Authorization: Bearer` header — except for
 * `apiinfo.version`, which Zabbix rejects when that header is present.
 *
 * Returns the `result` payload, or throws a NodeApiError carrying the Zabbix
 * `error.data` detail when the API reports an error.
 */
export async function zabbixApiRequest(
	this: ZabbixRequestContext,
	method: string,
	params: IDataObject | unknown[] = {},
): Promise<unknown> {
	const credentials = await this.getCredentials('zabbixTokenApi');
	const baseUrl = String(credentials.url).replace(/\/$/, '');

	const headers: IDataObject = { 'Content-Type': 'application/json-rpc' };
	if (method !== 'apiinfo.version') {
		headers.Authorization = `Bearer ${credentials.apiToken as string}`;
	}

	const options: IHttpRequestOptions = {
		method: 'POST',
		url: `${baseUrl}/api_jsonrpc.php`,
		headers,
		body: {
			jsonrpc: '2.0',
			method,
			params,
			id: 1,
		},
		json: true,
	};

	const response = await sendJsonRpc(this, options);

	if (response?.error) {
		throw new NodeApiError(this.getNode(), response.error as unknown as JsonObject, {
			message: response.error.message,
			description: response.error.data,
		});
	}

	return response?.result;
}
