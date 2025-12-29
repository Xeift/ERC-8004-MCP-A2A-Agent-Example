import 'dotenv/config';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { AsyncLocalStorage } from 'async_hooks';
import express, { type Request, type Response } from 'express';
import { paymentMiddleware, type Resource } from 'x402-express';
import { NetworkSchema } from 'x402/types';
import { z } from 'zod';
import { getAgentId } from '../erc-8004/agent-id-manager.js';
import { FeedbackManager } from '../erc-8004/feedback-manager.js';
import { generateImage } from './generate-image.js';
import { uploadImgbb } from './upload-imgbb.js';


type RequestContext = {
  payerAddress?: string;
};

const requestContext = new AsyncLocalStorage<RequestContext>();


function tryDecodePaymentHeaderToJson(headerValue: string): any | undefined {
  const encodings: Array<BufferEncoding> = ['base64', 'base64url'];

  for (const enc of encodings) {
    try {
      const raw = Buffer.from(headerValue, enc).toString('utf8');
      return JSON.parse(raw);
    } catch {
    }
  }
  return undefined;
}

function getPayerAddressFromX402Header(req: Request): string | undefined {
  // v2: PAYMENT-SIGNATURE, v1: X-PAYMENT
  const headerValue = req.get('PAYMENT-SIGNATURE') ?? req.get('X-PAYMENT');
  if (!headerValue) return undefined;

  const decoded = tryDecodePaymentHeaderToJson(headerValue);
  if (!decoded) return undefined;

  const from = decoded?.payload?.authorization?.from;
  return typeof from === 'string' ? from : undefined;
}

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
      description: 'Generate image from a given prompt. Return a generated image URL and a ERC-8004 feedbackAuth.',
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

      console.log('----------  ERC-8004 feedbackAuth signed  ----------');
      const payerAddress = requestContext.getStore()?.payerAddress; // read the previous saved payerAddress from store
      const feedbackAuth = await new FeedbackManager(process.env.A2_PRIVATE_KEY!).signFeedbackAuth(agentId, payerAddress!);
      console.log(`Address: ${payerAddress}`);
      console.log(`feedbackAuth: ${feedbackAuth}`);
      console.log('----------  ERC-8004 feedbackAuth signed  ----------\n');

      const payload = { feedbackAuth, imgURL };
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(payload),
          },
        ],
        structuredContent: payload,
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
      const isToolCall = req.body?.method === 'tools/call';
      const payerAddress = isToolCall ? getPayerAddressFromX402Header(req) : undefined;

      if (isToolCall) {
        console.log('----------  x402 payerAddress in header  ----------');
        console.log(payerAddress);
        console.log('----------  x402 payerAddress in header  ----------\n');
      }

      const store: RequestContext = payerAddress ? { payerAddress } : {};
      await requestContext.run(store, async () => { // save payerAddress in store first, use it in generate_image tool later
        await transport.handleRequest(req, res, req.body); // use transport to convert mcp <-> http
      });
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
