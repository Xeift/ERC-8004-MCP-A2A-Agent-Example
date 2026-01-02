import { MCPServerStreamableHttp, tool } from '@openai/agents';
import { z } from 'zod';
import { x402Fetch } from './x402-fetch.js';

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
    toolArgs: z.record(z.any()).nullable(),
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
      const content = await server.callTool(toolName, toolArgs ?? {});
      const structuredContent = parseStructuredContent(content);
      return { baseURL, toolName, content, structuredContent };
    } finally {
      await server.close();
    }
  },
});
