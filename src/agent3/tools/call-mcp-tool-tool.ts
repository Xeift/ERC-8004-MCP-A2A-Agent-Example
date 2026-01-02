import { MCPServerStreamableHttp, tool } from '@openai/agents';
import { z } from 'zod';
import { FeedbackManager } from '../../erc-8004/feedback-manager.js';
import { getAgentIdByBaseUrl } from '../../erc-8004/remote-agent-manager.js';
import { x402Fetch } from '../x402-fetch.js';

type MCPContentItem = {
  type?: string;
  text?: string;
};

function parseStructuredContent(content: unknown): unknown | undefined {
  if (!Array.isArray(content)) return undefined;
  for (const item of content) {
    if (!item || typeof item !== 'object') continue;
    const record = item as MCPContentItem;
    if (record.type === 'text' && typeof record.text === 'string') {
      try {
        return JSON.parse(record.text);
      } catch {
        return { text: record.text };
      }
    }
  }
  return undefined;
}

export const callMcpToolTool = tool({
  name: 'call_mcp_tool',
  description: 'Call a MCP tool by baseURL (include /mcp), toolName, toolArgs.',
  parameters: z.object({
    baseURL: z.string(),
    toolName: z.string(),
    toolArgs: z.union([z.record(z.any()), z.string()]).nullable(),
  }),
  execute: async ({ baseURL, toolName, toolArgs }) => {
    const privateKey = process.env.A3_PRIVATE_KEY;
    if (!privateKey) throw new Error('Missing A3_PRIVATE_KEY in .env');
    const fetchImpl = await x402Fetch(privateKey);

    const server = new MCPServerStreamableHttp({
      url: baseURL,
      name: `MCP (${baseURL})`,
      cacheToolsList: false,
      fetch: fetchImpl,
    });

    await server.connect();
    try {
      let resolvedArgs: Record<string, unknown> = {};
      if (toolArgs) {
        if (typeof toolArgs === 'string') {
          const parsed = JSON.parse(toolArgs);
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('toolArgs string must be a JSON object');
          }
          resolvedArgs = parsed as Record<string, unknown>;
        } else {
          resolvedArgs = toolArgs;
        }
      }
      const content = await server.callTool(toolName, resolvedArgs);
      const structuredContent = parseStructuredContent(content);
      const agentId = getAgentIdByBaseUrl(baseURL);
      FeedbackManager.saveFeedbackMaterial(agentId, JSON.stringify(toolArgs));

      return { baseURL, toolName, content, structuredContent };
    } finally {
      await server.close();
    }
  },
});
