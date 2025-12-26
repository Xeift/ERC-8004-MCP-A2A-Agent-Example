import 'dotenv/config';

import { z } from 'zod';
import { callA2AServer, fetchAgentCard } from './a2a-client.js';

import { Agent, MCPServerStreamableHttp, run, RunResult, setDefaultOpenAIClient, setOpenAIAPI, setTracingDisabled, tool } from '@openai/agents';
import { OpenAI } from 'openai/client.js';
import { getAgentId } from '../erc-8004/agent-id-manager.js';
import { x402Fetch } from './x402-fetch.js';


const agentId = getAgentId('agent3');
if (!agentId) throw new Error('Though it\'s not required to register as an ERC-8004 agent to give feedback, in this example we use `register:a3` first to register the agent on chain.')

const privateKey = process.env.A3_PRIVATE_KEY;
if (!privateKey) throw new Error('Missing A3_PRIVATE_KEY in .env');

console.log('----------  Logged in as Agent3  ----------');
console.log(`ERC-8004 Identity Registry agentId: ${agentId}`);
console.log('----------  Logged in as Agent3  ----------\n');

// -----  use custom client  -----
setOpenAIAPI('chat_completions');
setTracingDisabled(true);
setDefaultOpenAIClient(
  new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY!,
  })
)

// -----  add custom tool  -----
const fetchAgentCardTool = tool({
  name: 'fetch_agent_card',
  description: 'Fetch A2A Agent Card by providing baseURL. baseURL only contains scheme, domain and port(if any).',
  parameters: z.object({ baseURL: z.string() }),
  execute: async ({ baseURL }) => {
    return await fetchAgentCard(baseURL);
  }
});

const callA2AServerTool = tool({
  name: 'call_a2a_server',
  description: 'Call any A2A server by providing baseURL and message. baseURL only contains scheme, domain and port(if any).',
  parameters: z.object({ baseURL: z.string(), message: z.string() }),
  execute: async ({ baseURL, message }) => {
    return await callA2AServer(baseURL, message);
  }
});

// -----  add agent2 mcp server  ----
const url = `http://localhost:${process.env.A2_SERVER_PORT}/mcp`;
const paidFetch = await x402Fetch(privateKey);
const agent2McpServer = new MCPServerStreamableHttp({
  url,
  fetch: paidFetch, // integrate x402
  name: 'Agent2 MCP Server',
  cacheToolsList: false,
});
await agent2McpServer.connect();

// -----  create agent  -----
const agent = new Agent({
  name: 'Assistant',
  instructions: `
  一律用繁體中文（zh-TW）回覆所有問題。
  你是一位專業的 Web3 研究員，使用者給定一個主題，你負責產生 Web3 日報給使用者。
  使用 A2A 的流程是先用 fetch_agent_card 取得 Agent Card，再根據 Agent Card 中的 endpoint 用 call_a2a_server。
  你必須使用 A2A 委託 http://localhost:3000 的 agent 幫你查詢各種你需要的資料（不可委託其產日報）。
  也必須使用 Agent2 MCP Server 的工具幫你畫日報**內容**相關的圖。
  儘量避免生成的圖中出現文字。
  你非常喜歡臺灣小吃，所以可以適時用臺灣小吃和譬喻的方式解釋複雜的概念。
  `,
  model: 'nvidia/nemotron-3-nano-30b-a3b:free',
  tools: [fetchAgentCardTool, callA2AServerTool],
  mcpServers: [agent2McpServer]
});

// -----  print each round message  -----
function printResult(result: RunResult<any, Agent<any, any>>) {

  function printJson(input: any): string {
    if (input !== null && typeof input === 'object') {
      return JSON.stringify(input)
    }
    return input;
  }

  result.output.forEach((item: any, index: number) => {
    console.log(`----------  第 ${index + 1} 輪輸出  ----------`);
    let out: string = '';
    if (item.type === 'message') {
      out = `✅［模型回覆］\n${printJson(item.content[0].text)}`;
    }
    else if (item.type === `function_call`) {
      out = `🛠️［呼叫工具：${item.name}］\n${printJson(item.arguments)}`;
    }
    else if (item.type === 'function_call_result') {
      out = `📩［工具回應：${item.name}］\n${printJson(item.output)}`;
    }
    else if (item.type === 'reasoning') {
      out = `🤔［推理］\n${printJson(item.rawContent[0]['text'])}`;
    }
    else {
      console.log(typeof (item));
      out = `🟥［其他］\n${printJson(item)}`;
    }
    console.log(out.substring(0, 200));
    console.log(`----------  第 ${index + 1} 輪輸出  ----------\n`);
  });

  console.log(`----------  最終輸出  ----------`);
  console.log(result.finalOutput);
  console.log(`----------  最終輸出  ----------\n`);
}

const result = await run(
  agent,
  // '幫我產生 ERC-8004 的日報',
  // '[暫時性任務] 幫我產生一張像素機器人的圖片，prompt 由你設計。feedbackAuth 請你暫時印出來就好，不需要特別做處理。',
  '[暫時性任務] 幫我取得最新的以太坊區塊號碼。feedbackAuth 請你暫時印出來就好，不需要特別做處理。',
);
printResult(result);
await agent2McpServer.close();