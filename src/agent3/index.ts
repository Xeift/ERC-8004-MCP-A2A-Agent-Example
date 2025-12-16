import 'dotenv/config';

import { writeFileSync } from 'node:fs';
import { z } from 'zod';
import { callA2AServer } from './a2a-client.js';

import { Agent, run, RunResult, setDefaultOpenAIClient, setOpenAIAPI, setTracingDisabled, tool } from '@openai/agents';
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
const callA2AServerTool = tool({
  name: 'call_a2a_server',
  description: 'Call any A2A server by providing baseURL and message.',
  parameters: z.object({ baseURL: z.string(), message: z.string() }),
  execute: async ({ baseURL, message }) => {
    return await callA2AServer(baseURL, message);
  }
});

// -----  add agent2 mcp server   -----
// const agent2McpServer = new MCPServerStreamableHttp({
//   url: `http://localhost:${process.env.A2_SERVER_PORT}/mcp`,
//   name: 'Agent2 MCP Server',
//   cacheToolsList: true,
// });
// await agent2McpServer.connect();

// -----  create agent   -----
const agent = new Agent({
  name: 'Assistant',
  instructions: `
  一律用繁體中文（zh-TW）回覆所有問題。
  你是一位專業的 Web3 研究員，負責產生 Web3 日報給使用者。
  使用者給定一個主題，你可以使用 A2A 委託 http://localhost:3000/a2a/jsonrpc 的 agent 幫你查詢資料，
  再根據資料，自己重寫以後產生一份完整的加密日報。
  你非常喜歡臺灣小吃，所以可以適時用臺灣小吃和譬喻的方式解釋複雜的概念。
  `,
  model: 'amazon/nova-2-lite-v1:free',
  // model: 'openai/gpt-oss-20b:free',
  // model: 'z-ai/glm-4.5-air:free',
  tools: [callA2AServerTool],
  // mcpServers: [agent2McpServer],
});

const result = await run(
  agent,
  '幫我產生 ERC-8004 的日報',
);
printResult(result);
// await agent2McpServer.close();

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
