import { tool } from '@openai/agents';
import { z } from 'zod';
import type { RemoteAgentManager } from '../../erc-8004/remote-agent-manager.js';

export function get8004AgentDetailTool(remoteAgentManager: RemoteAgentManager) {
  return tool({
    name: 'get_8004_agent_detail',
    description: 'Provide an agentId, return details (MCP, A2A endpoints...) of the agent.',
    parameters: z.object({ agentId: z.string() }),
    execute: async ({ agentId }) => {
      const registrationFiles = await remoteAgentManager.getAgentDetail(agentId);

      return JSON.stringify(registrationFiles);
    },
  });
}
