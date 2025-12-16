import 'dotenv/config';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express, { type Request, type Response } from 'express';
import { z } from 'zod';
import { generateImage } from './generate-image.js';
import { uploadImgbb } from './upload-imgbb.js';

async function main() {
  // -----  create mpc server  -----
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
      const imgBase64 = await generateImage(prompt); // call actual tool
      const imgURL = await uploadImgbb(imgBase64);
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

  // -----  create http server using express  -----
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
