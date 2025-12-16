import { ClientFactory } from '@a2a-js/sdk/client';
import 'dotenv/config';
import { v4 as uuidv4 } from 'uuid';


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
    const factory = new ClientFactory();
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