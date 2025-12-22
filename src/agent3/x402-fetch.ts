import 'dotenv/config';
import { createSigner, wrapFetchWithPayment } from 'x402-fetch';

type FetchLike = typeof fetch;
let fetchWithPayment: FetchLike | null = null;

// prevent 406 error: Not Acceptable: Client must accept both application/json and text/event-stream
// 
// 1. a3 mcp client will send request with following header:
// headers.set('content-type', 'application/json');
// headers.set('accept', 'application/json, text/event-stream');
// so a2 mcp server receive without problem, and return 402 payment required
//
// 2. but after client paid USDC and x402 retry the request, x402-fetch will make the header empty.
// in node_modules/x402-fetch/dist/esm/index.mjs:
// 305 const headers = await this._commonHeaders();
// 306 headers.set('content-type', 'application/json');
// 307 headers.set('accept', 'application/json, text/event-stream');
// 308 const init = {
// 309   ...this._requestInit,
// 310   method: 'POST',
// 311   headers,
// 312   body: JSON.stringify(message),
// };
//
// the script uses "..." to copy previous header
// when it copy normal objects `{ ... }`, it works without any problem
// when it copy Headers object `new Headers`, it will turn in to empty object `{}`
// in line 306 headers is a Headers object
//
// 3. since there's no application/json and text/event-stream in request,
// when a2 mcp server received the request from a3 mcp client,
// it thinks the request might be wrong and respond with 406

function normalizeHeaders(headers: RequestInit['headers']): HeadersInit | undefined {
    if (!headers) return undefined;
    if (headers instanceof Headers) {
        return Object.fromEntries(headers.entries());
    }
    if (Array.isArray(headers)) { // headers object -> normal object
        return Object.fromEntries(headers);
    }
    return { ...headers };
}

export async function x402Fetch(privateKey: string) {
    if (!fetchWithPayment) {
        const signer = await createSigner(process.env.CHAIN_NAME!, privateKey);
        const paidFetch = wrapFetchWithPayment(fetch, signer);
        fetchWithPayment = (input, init) => {
            if (!init) {
                return paidFetch(input as RequestInfo, init);
            }
            const normalizedHeaders = normalizeHeaders(init.headers);
            const normalizedInit = normalizedHeaders
                ? { ...init, headers: normalizedHeaders }
                : init;
            return paidFetch(input as RequestInfo, normalizedInit);
        };
    }

    return fetchWithPayment;
}
