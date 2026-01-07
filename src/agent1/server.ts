import 'dotenv/config';

import { AGENT_CARD_PATH, type AgentCard, type Message, type TextPart } from '@a2a-js/sdk';
import {
  DefaultRequestHandler,
  InMemoryTaskStore,
  type RequestContext as A2ARequestContext,
  type AgentExecutor,
  type ExecutionEventBus,
} from '@a2a-js/sdk/server';
import { agentCardHandler, jsonRpcHandler, UserBuilder } from '@a2a-js/sdk/server/express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { AsyncLocalStorage } from 'async_hooks';
import express, { type Request, type Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { paymentMiddleware, type Resource } from 'x402-express';
import { NetworkSchema } from 'x402/types';
import { z } from 'zod';
import { getAgentId } from '../erc-8004/agent-id-manager.js';
import { FeedbackManager } from '../erc-8004/feedback-manager.js';
import { askAgent1 } from './ask-agent1.js';
import { getBlockNumber } from './get-block-number.js';
import { getCryptoPrice } from './get-crypto-price.js';

const PORT = process.env.A1_SERVER_PORT;

type McpRequestContext = {
  payerAddress?: string;
};
const mcpRequestContext = new AsyncLocalStorage<McpRequestContext>();

type A2aRequestContext = {
  payerAddress?: string;
};
const a2aRequestContext = new AsyncLocalStorage<A2aRequestContext>();

type X402PaymentHeader = {
  payload?: {
    authorization?: {
      from?: string;
    };
  };
};

function isX402PaymentHeader(value: unknown): value is X402PaymentHeader {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function tryDecodePaymentHeaderToJson(headerValue: string): unknown | undefined {
  const encodings: Array<BufferEncoding> = ['base64', 'base64url'];

  for (const enc of encodings) {
    try {
      const raw = Buffer.from(headerValue, enc).toString('utf8');
      return JSON.parse(raw);
    } catch {}
  }
  return undefined;
}

function getPayerAddressFromX402Header(req: Request): string | undefined {
  // v2: PAYMENT-SIGNATURE, v1: X-PAYMENT
  const headerValue = req.get('PAYMENT-SIGNATURE') ?? req.get('X-PAYMENT');
  if (!headerValue) return undefined;

  const decoded = tryDecodePaymentHeaderToJson(headerValue);
  if (!isX402PaymentHeader(decoded)) return undefined;

  const from = decoded?.payload?.authorization?.from;
  return typeof from === 'string' ? from : undefined;
}

async function main() {
  const agentId = getAgentId('agent1');
  if (!agentId)
    throw new Error(
      "In order to accept feedback from client agent, it's required to use `register:a1` first to register the agent on chain!",
    );
  const network = NetworkSchema.parse(process.env.CHAIN_NAME);

  // ========================================
  // ========================================
  //                    MCP
  // ========================================
  // ========================================

  // -----  create mcp server  -----
  const mcpServer = new McpServer({
    name: 'crypto-price-mcp',
    version: '1.0.0',
  });

  // -----  register available tool to mpc server  -----
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
      console.log('----------  ERC-8004 feedbackAuth signed  ----------');
      const payerAddress = mcpRequestContext.getStore()?.payerAddress;
      const feedbackAuth = await new FeedbackManager(process.env.A1_PRIVATE_KEY!).signFeedbackAuth(
        agentId,
        payerAddress!,
      );
      console.log(`Address: ${payerAddress}`);
      console.log(`feedbackAuth: ${feedbackAuth}`);
      console.log('----------  ERC-8004 feedbackAuth signed  ----------\n');

      const payload = { feedbackAuth, ...data };
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

  mcpServer.registerTool(
    'get_eth_block_number',
    {
      title: 'Get Ethereum latest block number',
      description: 'Get the latest Ethereum block number using JSON-RPC eth_blockNumber.',
      inputSchema: {},
    },
    async () => {
      const data = await getBlockNumber(); // call actual tool
      console.log('----------  ERC-8004 feedbackAuth signed  ----------');
      const payerAddress = mcpRequestContext.getStore()?.payerAddress;
      const feedbackAuth = await new FeedbackManager(process.env.A1_PRIVATE_KEY!).signFeedbackAuth(
        agentId,
        payerAddress!,
      );
      console.log(`Address: ${payerAddress}`);
      console.log(`feedbackAuth: ${feedbackAuth}`);
      console.log('----------  ERC-8004 feedbackAuth signed  ----------\n');

      const payload = { feedbackAuth, ...data };
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

  // ========================================
  // ========================================
  //                    A2A
  // ========================================
  // ========================================

  // -----  add a2a agent executor to reply the request  -----
  class CryptoPriceExecutor implements AgentExecutor {
    async execute(requestContext: A2ARequestContext, eventBus: ExecutionEventBus): Promise<void> {
      console.log('----------  ERC-8004 feedbackAuth signed  ----------');
      const payerAddress = a2aRequestContext.getStore()?.payerAddress;
      const feedbackAuth = await new FeedbackManager(process.env.A1_PRIVATE_KEY!).signFeedbackAuth(
        agentId!,
        payerAddress!,
      );
      console.log(`Address: ${payerAddress}`);
      console.log(`feedbackAuth: ${feedbackAuth}`);
      console.log('----------  ERC-8004 feedbackAuth signed  ----------\n');

      const parts = requestContext.userMessage?.parts ?? [];

      let userText = '';
      for (const part of parts) {
        if (part.kind === 'text') {
          const textPart = part as TextPart;
          userText = textPart.text;
          break;
        }
      }
      console.log('----------  server: received remote request  ----------');
      console.log(`user message: ${userText}`);
      console.log('----------  server: received remote request  ----------\n');

      const response = await askAgent1(userText);
      const payload = { feedbackAuth, result: response };
      const msg: Message = {
        kind: 'message',
        messageId: uuidv4(),
        role: 'agent',
        contextId: requestContext.contextId,
        parts: [
          { kind: 'text', text: response },
          { kind: 'data', data: payload }, // there's no structuredContent in a2a so we use 'data' part
        ],
      };

      eventBus.publish(msg);
      eventBus.finished();
    }
    cancelTask = async () => {};
  }

  // -----  add a2a agent card  -----
  const agentCard: AgentCard = {
    name: 'Crypto Data Agent',
    description:
      'A crypto data agent that provides cryptocurrency prices in USD and retrieves the latest Ethereum block number. Powered by Coingecko API and Ethereum RPC. Supports ERC-8004, MCP, and A2A.',
    protocolVersion: '0.3.0',
    version: '1.1.0',
    url: `http://localhost:${PORT}/a2a/jsonrpc`,
    skills: [
      {
        id: 'get_crypto_price',
        name: 'Get Crypto Price',
        description: "Provide token symbols like 'BTC,ETH' to retrieve prices in USD.",
        tags: ['crypto', 'price'],
      },
      {
        id: 'get_latest_ethereum_block',
        name: 'Get Latest Ethereum Block Number',
        description: 'Retrieve the latest block number from the Ethereum network.',
        tags: ['ethereum', 'block', 'rpc'],
      },
    ],
    capabilities: { pushNotifications: false },
    defaultInputModes: ['text'],
    defaultOutputModes: ['text'],
  };

  // -----  add a2a request handler to deal with http request  -----
  const a2aRequestHandler = new DefaultRequestHandler(
    agentCard,
    new InMemoryTaskStore(),
    new CryptoPriceExecutor(),
  );

  // ========================================
  // ========================================
  //        Http Server + A2A + MCP
  // ========================================
  // ========================================

  // -----  create http server using express, integrate x402 middleware  -----
  const app = express();
  app.use(express.json());

  const mcpPayment = paymentMiddleware(
    process.env.A1_ADDRESS as `0x${string}`,
    {
      'POST /mcp': {
        price: '$0.002',
        network: network,
        config: { maxTimeoutSeconds: 180 },
      },
    },
    {
      url: process.env.FACILITATOR_URL as Resource,
    },
  );

  // -----  add mcp endpoint  -----
  app.post(
    '/mcp',
    async (req: Request, res: Response, next) => {
      if (req.body?.method === 'tools/call') {
        // only charge when tool call (prevent charge on connect ：( )
        return mcpPayment(req, res, next);
      }
      return next();
    },
    async (req: Request, res: Response) => {
      try {
        const isToolCall = req.body?.method === 'tools/call';
        const payerAddress = isToolCall ? getPayerAddressFromX402Header(req) : undefined;

        if (isToolCall) {
          console.log('----------  x402 payerAddress in header  ----------');
          console.log(payerAddress);
          console.log('----------  x402 payerAddress in header  ----------\n');
        }

        const store: McpRequestContext = payerAddress ? { payerAddress } : {};
        await mcpRequestContext.run(store, async () => {
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
    },
  );

  const a2aPayment = paymentMiddleware(
    process.env.A1_ADDRESS as `0x${string}`,
    {
      'POST /a2a/jsonrpc': {
        price: '$0.002',
        network,
        config: { maxTimeoutSeconds: 180 },
      },
    },
    { url: process.env.FACILITATOR_URL as Resource },
  );

  // -----  add a2a endpoint  -----
  app.use(`/${AGENT_CARD_PATH}`, agentCardHandler({ agentCardProvider: a2aRequestHandler }));
  app.post(
    '/a2a/jsonrpc',
    async (req, res, next) => {
      const method = req.body?.method;
      const isPaidRequest =
        method === 'message/send' || method === 'message/stream' || method === 'tasks/resubscribe';
      if (isPaidRequest) {
        // only charge when task or normal message
        return a2aPayment(req, res, next);
      }
      return next();
    },
    async (req, res, next) => {
      try {
        const method = req.body?.method;
        const isPaidRequest =
          method === 'message/send' ||
          method === 'message/stream' ||
          method === 'tasks/resubscribe';
        const payerAddress = isPaidRequest ? getPayerAddressFromX402Header(req) : undefined;

        if (isPaidRequest) {
          console.log('----------  x402 payerAddress in header  ----------');
          console.log(method);
          console.log(payerAddress);
          console.log('----------  x402 payerAddress in header  ----------\n');
        }

        const store: A2aRequestContext = payerAddress ? { payerAddress } : {};
        return a2aRequestContext.run(store, () => next());
      } catch (error) {
        console.error('Error handling A2A request:', error);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: { code: -32603, message: 'Internal server error' },
            id: null,
          });
        }
      }
    },
  );
  app.use(
    '/a2a/jsonrpc',
    jsonRpcHandler({
      requestHandler: a2aRequestHandler,
      userBuilder: UserBuilder.noAuthentication,
    }),
  );

  app.listen(PORT, () => {
    console.log('----------  Agent1 Server Start  ----------');
    console.log(`ERC-8004 Identity Registry agentId: ${agentId}`);
    console.log(`Start MCP Server on http://localhost:${PORT}/mcp`);
    console.log(`Start A2A Server on http://localhost:${PORT}/a2a/jsonrpc`);
    console.log(`Host A2A Agent Card on http://localhost:${PORT}/${AGENT_CARD_PATH}`);
    console.log('----------  Agent1 Server Start  ----------\n');
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
