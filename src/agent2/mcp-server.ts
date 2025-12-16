import 'dotenv/config';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express, { type Request, type Response } from 'express';
// import { getBlockNumber } from './get-block-number.js';

async function main() {
  // -----  create mpc server   -----
  const mcpServer = new McpServer({
    name: 'ethereum-block-mcp',
    version: '1.0.0',
  });

  // -----  register available tool to mpc server   -----
  // mcpServer.registerTool(
  //   'get_block_number',
  //   {
  //     title: 'Get block number',
  //     description: 'Get the current Ethereum block number in hex and dec.',
  //     inputSchema: {},
  //   },
  //   async () => {
  //     const data = await getBlockNumber(); // call actual tool
  //     return {
  //       content: [
  //         {
  //           type: 'text',
  //           text: JSON.stringify(data),
  //         },
  //       ],
  //       structuredContent: data,
  //     };
  //   },
  // );

  // -----  convert http <-> mcp   -----
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await mcpServer.connect(transport);

  // -----  create http server using express   -----
  const app = express();
  app.use(express.json());

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

  const PORT = process.env.A2_SERVER_PORT;
  app.listen(PORT, () => {
    console.log(`listening on http://localhost:${PORT}/mcp`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
