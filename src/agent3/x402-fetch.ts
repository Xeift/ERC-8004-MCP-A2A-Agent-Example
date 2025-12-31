import 'dotenv/config';
import { createSigner, decodeXPaymentResponse, wrapFetchWithPayment } from 'x402-fetch';
import { decodePayment } from 'x402/schemes';
import { FeedbackManager } from '../erc-8004/feedback-manager.js';

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

function getHeaderValue(headers: RequestInit['headers'], name: string): string | undefined {
    if (!headers) return undefined;
    const lowerName = name.toLowerCase();
    if (headers instanceof Headers) {
        return headers.get(name) ?? headers.get(lowerName) ?? undefined;
    }
    if (Array.isArray(headers)) {
        const match = headers.find(([key]) => key.toLowerCase() === lowerName);
        return match?.[1];
    }
    const record = headers as Record<string, string | string[] | undefined>;
    const value = record[name] ?? record[lowerName];
    if (Array.isArray(value)) return value.join(', ');
    return typeof value === 'string' ? value : undefined;
}

function extractAmountFromPaymentHeader(paymentHeader: string | undefined): string | undefined {
    if (!paymentHeader) return undefined;
    try {
        const decoded = decodePayment(paymentHeader);
        const payload = decoded.payload as { authorization?: { value?: string } };
        const value = payload.authorization?.value;
        return typeof value === 'string' ? value : undefined;
    } catch {
        return undefined;
    }
}

export async function x402Fetch(privateKey: string) {
    if (!fetchWithPayment) {
        const signer = await createSigner(process.env.CHAIN_NAME!, privateKey);
        const instrumentedFetch: FetchLike = async (input, init) => {
            const response = await fetch(input, init);
            const paymentHeader = getHeaderValue(init?.headers, 'X-PAYMENT');
            const paymentResponseHeader = response.headers.get('X-PAYMENT-RESPONSE');
            let amount: string | undefined;
            let txHash: string | undefined;
            let payer: string | undefined;

            if (paymentHeader || paymentResponseHeader) {
                amount = extractAmountFromPaymentHeader(paymentHeader);

                if (paymentResponseHeader) {
                    try {
                        const decoded = decodeXPaymentResponse(paymentResponseHeader);
                        txHash = decoded.transaction;
                        payer = decoded.payer;
                    }
                    catch {
                    }
                }
            }

            let amountNumber: number | undefined;
            if (amount !== undefined) {
                const parsedAmount = Number.parseFloat(amount);
                if (Number.isFinite(parsedAmount)) {
                    amountNumber = parsedAmount;
                }
            }
            if (amountNumber !== undefined || txHash || payer) {
                FeedbackManager.saveFeedbackMaterial(
                    undefined,
                    undefined,
                    amountNumber,
                    txHash,
                    payer,
                );
            }

            return response;
        };
        const paidFetch = wrapFetchWithPayment(instrumentedFetch, signer);
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
