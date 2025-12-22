import 'dotenv/config';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express, { type Request, type Response } from 'express';
import { paymentMiddleware, type Resource } from 'x402-express';
import { NetworkSchema } from 'x402/types';
import { z } from 'zod';
import { getAgentId } from '../erc-8004/agent-id-manager.js';
import { generateImage } from './generate-image.js';
import { uploadImgbb } from './upload-imgbb.js';

async function main() {
  const agentId = getAgentId('agent2');
  if (!agentId) throw new Error('In order to accept feedback from client agent, it\'s required to use `register:a2` first to register the agent on chain!')
  const network = NetworkSchema.parse(process.env.CHAIN_NAME);

  // -----  create mcp server  -----
  const mcpServer = new McpServer({
    name: 'generate-image-mcp',
    version: '1.0.0',
  });

  // -----  register available tool to mcp server  -----
  mcpServer.registerTool(
    'generate_image',
    {
      title: 'Generate image',
      description: 'Generate image from a given prompt. Return a generated image URL. ',
      inputSchema: {
        prompt: z.string().describe('The prompt to generate the image. e.g.: A cute robot, pixel_art'),
      },
    },
    async ({ prompt }) => {
      console.log('----------  server: received remote request  ----------');
      console.log(`generating image, prompt:\n${prompt}`);
      console.log('----------  server: received remote request  ----------\n');
      const imgBase64 = await generateImage(prompt); // call actual tool
      const imgURL = await uploadImgbb(imgBase64);
      console.log('----------  server: done  ----------');
      console.log(`generated image link: ${imgURL}`);
      console.log('----------  server: done  ----------\n');
      return {
        content: [
          {
            type: 'text',
            text: imgURL
          },
        ],
      };
    },
  );

  // -----  convert http <-> mcp  -----
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await mcpServer.connect(transport);

  // -----  create http server using express, integrate x402 middleware  -----
  const app = express();
  app.use(express.json());

  const mcpPayment = paymentMiddleware(
    process.env.A2_ADDRESS as `0x${string}`,
    {
      'POST /mcp': {
        price: '$0.005',
        network: network,
      },
    },
    {
      url: process.env.FACILITATOR_URL as Resource,
    },
  );

  // -----  add mcp endpoint  -----
  app.post('/mcp', (req: Request, res: Response, next) => {
    if (req.body?.method === 'tools/call') { // only charge when tool call (prevent charge on connect ：( )
      return mcpPayment(req, res, next);
    }
    return next();
  }, async (req: Request, res: Response) => {
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
    console.log('----------  Agent2 Server Start  ----------');
    console.log(`ERC-8004 Identity Registry agentId: ${agentId}`);
    console.log(`Start MCP Server on http://localhost:${PORT}/mcp`);
    console.log('----------  Agent2 Server Start  ----------\n');
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
