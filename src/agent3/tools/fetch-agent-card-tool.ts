import { tool } from '@openai/agents';
import { z } from 'zod';

export const fetchAgentCardTool = tool({
  name: 'fetch_agent_card',
  description:
    'Fetch A2A Agent Card by providing baseURL. baseURL only contains scheme, domain and port(if any).',
  parameters: z.object({ baseURL: z.string() }),
  execute: async ({ baseURL }) => {
    return await fetchAgentCard(baseURL);
  },
});

async function fetchAgentCard(baseUrl: string): Promise<string> {
  if (!baseUrl.endsWith('.well-known/agent-card.json')) {
    if (!baseUrl.endsWith('/')) baseUrl += '/';
    baseUrl += '.well-known/agent-card.json';
  }
  const response = await fetch(baseUrl);
  if (!response.ok) return `status: ${response.status}`;

  const agentCard = response.text();

  return agentCard;
}
