import { tool } from '@openai/agents';
import { z } from 'zod';
import type { RemoteAgentManager } from '../../erc-8004/remote-agent-manager.js';

export function searchAvailable8004AgentTool(remoteAgentManager: RemoteAgentManager) {
  return tool({
    name: 'search_available_8004_agent',
    description:
      "Provide a keyword, return following ERC-8004 agents who's name contains the keyword.",
    parameters: z.object({ keyword: z.string() }),
    execute: async ({ keyword }) => {
      const agentSummary = await remoteAgentManager.searchAgent(keyword);

      return JSON.stringify(agentSummary);
    },
  });
}
