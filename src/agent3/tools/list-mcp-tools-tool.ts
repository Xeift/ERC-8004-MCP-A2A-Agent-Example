import { MCPServerStreamableHttp, tool } from '@openai/agents';
import { z } from 'zod';

export const listMcpToolsTool = tool({
  name: 'list_mcp_tools',
  description: 'List tools from a MCP server by baseURL (include /mcp).',
  parameters: z.object({
    baseURL: z.string(),
  }),
  execute: async ({ baseURL }) => {
    const server = new MCPServerStreamableHttp({
      url: baseURL,
      name: `MCP (${baseURL})`,
      cacheToolsList: false,
    });

    await server.connect();
    try {
      const tools = await server.listTools();
      return { baseURL, tools };
    } finally {
      await server.close();
    }
  },
});
