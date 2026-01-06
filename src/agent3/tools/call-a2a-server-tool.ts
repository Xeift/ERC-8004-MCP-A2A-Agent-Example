import type { Message, Task } from '@a2a-js/sdk';
import { ClientFactory, ClientFactoryOptions, JsonRpcTransportFactory } from '@a2a-js/sdk/client';
import { tool } from '@openai/agents';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { FeedbackManager } from '../../erc-8004/feedback-manager.js';
import { getAgentIdByBaseUrl } from '../../erc-8004/remote-agent-manager.js';
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

  const agentId = getAgentIdByBaseUrl(baseUrl);

  const { feedbackAuthRet, resultRet } = parseTextAndData(result);
  FeedbackManager.saveFeedbackMaterial(
    agentId,
    message,
    undefined,
    undefined,
    undefined,
    feedbackAuthRet,
    resultRet,
  );

  return JSON.stringify(result, null, 2);
}

function parseTextAndData(result: Message | Task) {
  let feedbackAuthRet: string | undefined;
  let resultRet: string | undefined;

  console.log(result.kind);
  console.log(result.kind != 'message');
  console.log(result.kind !== 'message');
  if (result.kind !== 'message') {
    return { feedbackAuthRet: undefined, resultRet: undefined };
  }

  let text: string | undefined;
  let data: Record<string, unknown> | undefined;
  const parts = result.parts;
  for (const part of parts) {
    if (part.kind === 'data') {
      data = part.data;
    } else if (part.kind === 'text') {
      text = part.text;
    }
  }

  if (data) {
    if (typeof data.feedbackAuth == 'string') feedbackAuthRet = data.feedbackAuth;
    if (typeof data.result == 'string') resultRet = data.result;
  } else if (text) {
    try {
      const parsedText = JSON.parse(text);
      if (typeof parsedText.feedbackAuth == 'string') feedbackAuthRet = parsedText.feedbackAuth;
      if (typeof parsedText.result == 'string') resultRet = parsedText.result;
    } catch {}
  }

  return { feedbackAuthRet, resultRet };
}
