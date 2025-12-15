import 'dotenv/config';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express, { type Request, type Response } from 'express';
import { z } from 'zod';
import { getCryptoPrice } from './get-crypto-price.js';

async function main() {
  // ========================================
  // ========================================
  //                    MCP
  // ========================================
  // ========================================

  // -----  create mpc server   -----
  const mcpServer = new McpServer({
    name: 'crypto-price-mcp',
    version: '1.0.0',
  });

  // -----  register available tool to mpc server   -----
  mcpServer.registerTool(
    'get_crypto_price',
    {
      title: 'Get crypto price in USD',
      description: 'Get the crypto price in USD for given token(s) using Coingecko API.',
      inputSchema: {
        tokens: z.string().describe("Comma-separated token symbols, e.g. 'BTC,ETH,BNB'"),
      },
    },
    async ({ tokens }) => {
      const data = await getCryptoPrice(tokens); // call actual tool
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(data),
          },
        ],
        structuredContent: data,
      };
    },
  );

  // -----  convert http <-> mcp   -----
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await mcpServer.connect(transport);

  // -----  create http server using express   -----
  const app = express();
  app.use(express.json());

  // ========================================
  // ========================================
  //                    A2A
  // ========================================
  // ========================================
  // TODO: integrate A2A

  app.post('/mcp', async (req: Request, res: Response) => {
    try {
      await transport.handleRequest(req, res, req.body); // use transport to convert mcp <-> http
    } catch (error) {
      console.error('Error handling MCP request:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  });

  const PORT = process.env.A1_SERVER_PORT;
  app.listen(PORT, () => {
    console.log(`listening on http://localhost:${PORT}/mcp`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
