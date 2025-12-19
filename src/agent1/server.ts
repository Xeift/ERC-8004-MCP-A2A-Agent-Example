import 'dotenv/config';

import { AGENT_CARD_PATH, type AgentCard, type Message, type TextPart } from '@a2a-js/sdk';
import { DefaultRequestHandler, InMemoryTaskStore, type AgentExecutor, type ExecutionEventBus, type RequestContext } from '@a2a-js/sdk/server';
import { agentCardHandler, jsonRpcHandler, UserBuilder } from '@a2a-js/sdk/server/express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express, { type Request, type Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { getAgentId } from '../erc-8004/agent-id-manager.js';
import { askAgent1 } from './ask-agent1.js';
import { getBlockNumber } from './get-block-number.js';
import { getCryptoPrice } from './get-crypto-price.js';

const PORT = process.env.A1_SERVER_PORT;

async function main() {
  const agentId = getAgentId('agent1');
  if (!agentId) throw new Error('In order to accept feedback from client agent, it\'s required to use `register:a1` first to register the agent on chain!')

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

  mcpServer.registerTool(
    'get_eth_block_number',
    {
      title: 'Get Ethereum latest block number',
      description: 'Get the latest Ethereum block number using JSON-RPC eth_blockNumber.',
      inputSchema: {},
    },
    async () => {
      const data = await getBlockNumber(); // call actual tool
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
    async execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
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

      const msg: Message = {
        kind: 'message',
        messageId: uuidv4(),
        role: 'agent',
        contextId: requestContext.contextId,
        parts: [{ kind: 'text', text: response }],
      };

      eventBus.publish(msg);
      eventBus.finished();

    }
    cancelTask = async () => { }
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
  }


  // -----  add a2a request handler to deal with http request  -----
  const a2aRequestHandler = new DefaultRequestHandler(
    agentCard,
    new InMemoryTaskStore(),
    new CryptoPriceExecutor(),
  )

  // ========================================
  // ========================================
  //        Http Server + A2A + MCP
  // ========================================
  // ========================================

  // -----  create http server using express  -----
  const app = express();
  app.use(express.json());

  // -----  add mcp endpoint  -----
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

  // -----  add a2a endpoint  -----
  app.use(`/${AGENT_CARD_PATH}`, agentCardHandler({ agentCardProvider: a2aRequestHandler }));
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
