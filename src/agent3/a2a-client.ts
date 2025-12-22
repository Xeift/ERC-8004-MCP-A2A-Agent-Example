import { ClientFactory, ClientFactoryOptions, JsonRpcTransportFactory } from '@a2a-js/sdk/client';
import 'dotenv/config';
import { v4 as uuidv4 } from 'uuid';
import { x402Fetch } from './x402-fetch.js';

export async function fetchAgentCard(baseUrl: string): Promise<string> {
    if (!baseUrl.endsWith('.well-known/agent-card.json')) {
        if (!baseUrl.endsWith('/')) baseUrl += '/'
        baseUrl += '.well-known/agent-card.json';
    }
    const response = await fetch(baseUrl);
    if (!response.ok) return `status: ${response.status}`

    const agentCard = response.text();

    return agentCard;
}

export async function callA2AServer(baseUrl: string, message: string): Promise<string> {
    const privateKey = process.env.A3_PRIVATE_KEY;
    if (!privateKey) throw new Error('Missing A3_PRIVATE_KEY in .env');

    const paidFetch = await x402Fetch(privateKey);
    const factory = new ClientFactory(
        ClientFactoryOptions.createFrom(ClientFactoryOptions.default, {
            transports: [new JsonRpcTransportFactory({ fetchImpl: paidFetch })],
        })
    );
    const client = await factory.createFromUrl(baseUrl);

    const result = await client.sendMessage({
        message: {
            kind: 'message',
            messageId: uuidv4(),
            role: 'user',
            parts: [{ kind: 'text', text: message }],
        },
    });

    return JSON.stringify(result, null, 2);
}