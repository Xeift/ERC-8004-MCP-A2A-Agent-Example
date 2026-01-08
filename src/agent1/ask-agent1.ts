import 'dotenv/config';

import { z } from 'zod';
import { getCryptoPrice } from './get-crypto-price.js';

import {
  Agent,
  type AgentOutputItem,
  MCPServerStreamableHttp,
  run,
  setDefaultOpenAIClient,
  setOpenAIAPI,
  setTracingDisabled,
  tool,
} from '@openai/agents';
import { OpenAI } from 'openai/client.js';
import { getBlockNumber } from './get-block-number.js';

// -----  use custom client   -----
setOpenAIAPI('chat_completions');
setTracingDisabled(true);
setDefaultOpenAIClient(
  new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY!,
  }),
);

// -----  add custom tool   -----
const getCryptoPriceTool = tool({
  name: 'get_crypto_price',
  description:
    'Get the crypto price in USD for given token(s) using Coingecko API. Tokens are separated by commas. e.g. BTC,ETH',
  parameters: z.object({ tokens: z.string() }),
  execute: async ({ tokens }) => {
    return await getCryptoPrice(tokens);
  },
});

const getBlockNumberTool = tool({
  name: 'get_block_number',
  description: 'Get the latest Ethereum mainnet block number.',
  parameters: z.object({}),
  execute: async () => {
    return await getBlockNumber();
  },
});

// -----  add mcp server  -----
const tavilyMcpServer = new MCPServerStreamableHttp({
  url: `https://mcp.tavily.com/mcp/?tavilyApiKey=${process.env.TAVILY_API_KEY}`,
  name: 'Tavily MCP Server',
  cacheToolsList: true,
});
await tavilyMcpServer.connect();

// -----  create agent  -----
const agent = new Agent({
  name: 'Assistant',
  instructions:
    '一律用繁體中文（zh-TW）回覆所有問題。你是一位專業的 Web3 研究員。使用者發問時，必須先用 tavily_search 工具搜尋，再用 get_crypto_price 工具取得即時幣價資料。',
  model: process.env.A1_MODEL!,
  tools: [getCryptoPriceTool, getBlockNumberTool],
  mcpServers: [tavilyMcpServer],
});

type TextPart = { text: string };

function isTextPart(value: unknown): value is TextPart {
  if (typeof value !== 'object' || value === null) return false;
  return typeof (value as { text?: unknown }).text === 'string';
}

function getTextFromContent(content: unknown): string | undefined {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return undefined;

  for (const part of content) {
    if (isTextPart(part)) return part.text;
  }
  return undefined;
}

type AgentRunResult = {
  output: AgentOutputItem[];
  finalOutput?: unknown;
};

// -----  print each round message  -----
function printResult(result: AgentRunResult) {
  function printJson(input: unknown): string {
    if (input === undefined) return 'undefined';
    if (input !== null && typeof input === 'object') {
      return JSON.stringify(input);
    }
    return String(input);
  }

  result.output.forEach((item, index) => {
    console.log(`----------  第 ${index + 1} 輪輸出  ----------`);
    let out: string = '';
    if (item.type === 'message') {
      const text = getTextFromContent(item.content);
      out = `✅［模型回覆］\n${printJson(text ?? item.content)}`;
    } else if (item.type === 'function_call') {
      out = `🛠️［呼叫工具：${item.name}］\n${printJson(item.arguments)}`;
    } else if (item.type === 'function_call_result') {
      out = `📩［工具回應：${item.name}］\n${printJson(item.output)}`;
    } else if (item.type === 'reasoning') {
      const text = getTextFromContent(item.rawContent);
      out = `🤔［推理］\n${printJson(text ?? item.content)}`;
    } else {
      console.log(typeof item);
      out = `🟥［其他］\n${printJson(item)}`;
    }
    console.log(out.substring(0, 200));
    console.log(`----------  第 ${index + 1} 輪輸出  ----------\n`);
  });

  console.log('----------  最終輸出  ----------');
  console.log(result.finalOutput);
  console.log('----------  最終輸出  ----------\n');
}

export async function askAgent1(message: string): Promise<string> {
  const result = await run(agent, message);
  printResult(result);
  const response = result.finalOutput!;
  return response;
}

// only close when stop script, prevent "Error: Server not initialized" error
process.on('SIGINT', async () => {
  await tavilyMcpServer.close();
  process.exit(0);
});
process.on('SIGTERM', async () => {
  await tavilyMcpServer.close();
  process.exit(0);
});
