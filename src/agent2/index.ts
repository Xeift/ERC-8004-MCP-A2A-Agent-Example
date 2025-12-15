import 'dotenv/config';

import { writeFileSync } from 'node:fs';
import { z } from 'zod';
import { getBlockNumber } from './get-block-number.js';

import { Agent, MCPServerStreamableHttp, run, RunResult, setDefaultOpenAIClient, setOpenAIAPI, setTracingDisabled, tool } from '@openai/agents';
import { OpenAI } from 'openai/client.js';

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

// -----  add agent1 mcp server   -----
const agent1McpServer = new MCPServerStreamableHttp({
  url: `http://localhost:${process.env.A1_SERVER_PORT}/mcp`,
  name: 'Agent1 MCP Server',
  cacheToolsList: true,
});
await agent1McpServer.connect();

// -----  create agent   -----
const agent = new Agent({
  name: 'Assistant',
  instructions: '使用繁體中文（zh-TW）回覆所有問題。',
  model: 'amazon/nova-2-lite-v1:free',
  tools: [getBlockNumberTool],
  mcpServers: [tavilyMcpServer, agent1McpServer],
});

const result = await run(
  agent,
  '目前以太坊區塊號碼是多少？',
);
printResult(result);

await tavilyMcpServer.close();
await agent1McpServer.close();

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
