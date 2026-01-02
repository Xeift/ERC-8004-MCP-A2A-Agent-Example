import { ClientFactory, ClientFactoryOptions, JsonRpcTransportFactory } from '@a2a-js/sdk/client';
import { tool } from '@openai/agents';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { x402Fetch } from '../x402-fetch.js';

export const callA2AServerTool = tool({
  name: 'call_a2a_server',
  description:
    'Call any A2A server by providing baseURL and message. baseURL only contains scheme, domain and port(if any).',
  parameters: z.object({ baseURL: z.string(), message: z.string() }),
  execute: async ({ baseURL, message }) => {
    return await callA2AServer(baseURL, message);
  },
});

async function callA2AServer(baseUrl: string, message: string): Promise<string> {
  const privateKey = process.env.A3_PRIVATE_KEY;
  if (!privateKey) throw new Error('Missing A3_PRIVATE_KEY in .env');

  const paidFetch = await x402Fetch(privateKey);
  const factory = new ClientFactory(
    ClientFactoryOptions.createFrom(ClientFactoryOptions.default, {
      transports: [new JsonRpcTransportFactory({ fetchImpl: paidFetch })],
    }),
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
