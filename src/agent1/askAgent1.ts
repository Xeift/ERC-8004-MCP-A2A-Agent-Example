import 'dotenv/config';

import { writeFileSync } from 'node:fs';
import { z } from 'zod';
import { getCryptoPrice } from './get-crypto-price.js';

import { Agent, MCPServerStreamableHttp, run, RunResult, setDefaultOpenAIClient, setOpenAIAPI, setTracingDisabled, tool } from '@openai/agents';
import { OpenAI } from 'openai/client.js';
import { getBlockNumber } from './get-block-number.js';


// -----  use custom client   -----
setOpenAIAPI('chat_completions');
setTracingDisabled(true);
setDefaultOpenAIClient(
  new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY!,
  })
)

// -----  add custom tool   -----
const getCryptoPriceTool = tool({
  name: 'get_crypto_price',
  description: 'Get the crypto price in USD for given token(s) using Coingecko API. Tokens are separated by commas. e.g. BTC,ETH',
  parameters: z.object({ tokens: z.string() }),
  execute: async ({ tokens }) => {
    return await getCryptoPrice(tokens);
  }
});

const getBlockNumberTool = tool({
  name: 'get_block_number',
  description: 'Get the latest Ethereum mainnet block number.',
  parameters: z.object({}),
  execute: async () => {
    return await getBlockNumber();
  }
});

// -----  add mcp server   -----
const tavilyMcpServer = new MCPServerStreamableHttp({
  url: `https://mcp.tavily.com/mcp/?tavilyApiKey=${process.env.TAVILY_API_KEY}`,
  name: 'Tavily MCP Server',
  cacheToolsList: true,
});
await tavilyMcpServer.connect();

// -----  create agent   -----
const agent = new Agent({
  name: 'Assistant',
  instructions: '一律用繁體中文（zh-TW）回覆所有問題。你是一位專業的 Web3 研究員。使用者發問時，先用 tavily_search 工具搜尋，再用 get_crypto_price 工具取得即時幣價資料。',
  model: 'amazon/nova-2-lite-v1:free',
  // model: 'openai/gpt-oss-20b:free',
  // model: 'z-ai/glm-4.5-air:free',
  tools: [getCryptoPriceTool, getBlockNumberTool],
  mcpServers: [tavilyMcpServer],
});

function printResult(result: RunResult<any, Agent<any, any>>) {
  const json = JSON.stringify(result.output, null, 2);
  writeFileSync('llm-output-logs.json', json, 'utf-8'); // TODO: remove later

  function printJson(input: any): string {
    if (input !== null && typeof input === 'object') {
      return JSON.stringify(input)
    }
    return input;
  }

  result.output.forEach((item: any, index: number) => {
    console.log(`----------   第 ${index + 1} 輪輸出    ----------`);
    let out: string = '';
    if (item.type === 'message') {
      out = `📨［純訊息］\n${printJson(item.content[0].text)}`;
    }
    else if (item.type === `function_call`) {
      out = `➡️［呼叫工具：${item.name}］\n${printJson(item.arguments)}`;
    }
    else if (item.type === 'function_call_result') {
      out = `⬅️［工具回應：${item.name}］\n${printJson(item.output)}`;
    }
    else {
      console.log(typeof (item));
      out = `🟥［其他］\n${printJson(item)}`;
    }
    console.log(out.substring(0, 200));
    console.log(`----------   第 ${index + 1} 輪輸出    ----------\n`);
  });

  console.log(`----------   最終輸出    ----------`);
  console.log(result.finalOutput);
  console.log(`----------   最終輸出    ----------\n`);
}

export async function askAgent1(message: string): Promise<string> {
  const result = await run(
    agent,
    message,
  );
  printResult(result);
  await tavilyMcpServer.close();
  const response = result.finalOutput!;
  return response;
}
