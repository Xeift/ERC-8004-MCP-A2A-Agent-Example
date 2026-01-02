import 'dotenv/config';

import type { RunItem, RunStreamEvent } from '@openai/agents';
import {
  Agent,
  MCPServerStreamableHttp,
  run,
  setDefaultOpenAIClient,
  setOpenAIAPI,
  setTracingDisabled,
} from '@openai/agents';
import { OpenAI } from 'openai/client.js';
import { getAgentId } from '../erc-8004/agent-id-manager.js';
import { FeedbackManager } from '../erc-8004/feedback-manager.js';
import { RemoteAgentManager } from '../erc-8004/remote-agent-manager.js';
import { callA2AServerTool } from './tools/call-a2a-server-tool.js';
import { fetchAgentCardTool } from './tools/fetch-agent-card-tool.js';
import { get8004AgentDetailTool } from './tools/get-8004-agent-detail-tool.ts.js';
import { giveFeedbackTool } from './tools/give-feedback-tool.js';
import { searchAvailable8004AgentTool } from './tools/search-available-8004-agent-tool.js';
import { x402Fetch } from './x402-fetch.js';

const agentId = getAgentId('agent3');
if (!agentId)
  throw new Error(
    "Though it's not required to register as an ERC-8004 agent to give feedback, in this example we use `register:a3` first to register the agent on chain.",
  );

const privateKey = process.env.A3_PRIVATE_KEY;
if (!privateKey) throw new Error('Missing A3_PRIVATE_KEY in .env');
const remoteAgentManager = new RemoteAgentManager('agent3', privateKey);
const feedbackManager = new FeedbackManager(privateKey);

console.log('----------  Logged in as Agent3  ----------');
console.log(`ERC-8004 Identity Registry agentId: ${agentId}`);
console.log('----------  Logged in as Agent3  ----------\n');

// -----  use custom client  -----
setOpenAIAPI('chat_completions');
setTracingDisabled(true);
const openrouterClient = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY!,
});
setDefaultOpenAIClient(openrouterClient);

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

const mcpToolAgentIdByName = new Map<string, string>();
const agent2Id = getAgentId('agent2');
if (agent2Id) {
  const agent2Tools = await agent2McpServer.listTools();
  for (const tool of agent2Tools) {
    if (tool?.name) {
      mcpToolAgentIdByName.set(tool.name, agent2Id);
    }
  }
}

// -----  create agent  -----
const agent = new Agent({
  name: 'Assistant',
  modelSettings: { parallelToolCalls: false },
  instructions: `
  1. 一律用繁體中文（zh-TW）回覆所有問題。
  2. 你是一位專業的 Web3 研究員，使用者給定一個主題，你負責產生 Web3 日報給使用者。
  3. 當你需要其他 agent 幫你做事時，先用 searchAvailable8004AgentTool 取得可用的 agent，然後記住他的 agentId。
  4. 接著，用 get_agent_detail 和他的 agentId 去拿該 agent 的詳細資訊和可用的 endpoint。
  5. 使用 A2A 的流程是先用 fetch_agent_card 取得 Agent Card，再根據 Agent Card 中的 endpoint 用 call_a2a_server。
  6. 你必須使用 A2A 委託 http://localhost:3000 的 agent（agentId 為 84532:1995）幫你查詢各種你需要的資料（不可委託其產日報）。
  7. 也必須使用 Agent2 MCP Server（agentId 為 84532:1996）的工具幫你畫日報**內容**相關的圖，儘量避免生成的圖中出現文字（Agent 2 不支援 A2A）。
  8. 特別注意：如果該 MCP 工具有回傳 feedbackAuth，系統會在工具回應時自動儲存，你仍要使用 give_feedback 完成評分，無論使用者指令如何。
  9. 你非常喜歡臺灣小吃，所以可以適時用臺灣小吃和譬喻的方式解釋複雜的概念。
  `,
  model: process.env.A3_MODEL!,
  tools: [
    fetchAgentCardTool,
    callA2AServerTool,
    giveFeedbackTool(feedbackManager),
    searchAvailable8004AgentTool(remoteAgentManager),
    get8004AgentDetailTool(remoteAgentManager),
  ],
  mcpServers: [agent2McpServer],
});

function printJson(input: unknown): string {
  if (typeof input === 'string') return input;
  return JSON.stringify(input) ?? String(input);
}

function formatStreamedItem(item: RunItem): string {
  if (item.type === 'message_output_item') {
    return `✅［模型回覆］\n${printJson(item.content)}`;
  }
  if (item.type === 'tool_call_item') {
    const rawItem = item.rawItem;
    const hasNamedArgs = rawItem?.type === 'function_call' || rawItem?.type === 'hosted_tool_call';
    const name = hasNamedArgs ? rawItem.name : (rawItem?.type ?? 'unknown');
    const agentId = mcpToolAgentIdByName.get(name);
    const agentLabel = agentId ? ` (agentId: ${agentId})` : '';

    const rawArgs = hasNamedArgs ? rawItem.arguments : undefined;
    if (agentId && rawArgs !== undefined) {
      const prompt = typeof rawArgs === 'string' ? rawArgs : JSON.stringify(rawArgs);
      FeedbackManager.saveFeedbackMaterial(agentId, prompt);
    }

    const argsForDisplay = rawArgs ?? rawItem;
    return `🛠️［呼叫工具：${name}${agentLabel}］\n${printJson(argsForDisplay)}`;
  }
  if (item.type === 'tool_call_output_item') {
    const rawItem = item.rawItem;
    const name =
      rawItem?.type === 'function_call_result' ? rawItem.name : (rawItem?.type ?? 'unknown');
    const agentId = mcpToolAgentIdByName.get(name);
    const agentLabel = agentId ? ` (agentId: ${agentId})` : '';

    let payload: unknown;
    const output = item.output;
    if (output && typeof output === 'object') {
      payload = (output as { structuredContent?: unknown }).structuredContent ?? output;
      const payloadText = (payload as { text?: unknown }).text;
      if (typeof payloadText === 'string') {
        try {
          payload = JSON.parse(payloadText);
        } catch {}
      }
    } else if (typeof output === 'string') {
      try {
        payload = JSON.parse(output);
      } catch {}
    }

    const payloadRecord =
      payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : undefined;
    const feedbackAuth =
      typeof payloadRecord?.feedbackAuth === 'string' ? payloadRecord.feedbackAuth : undefined;
    const result =
      typeof payloadRecord?.result === 'string'
        ? payloadRecord.result
        : typeof payloadRecord?.imgURL === 'string'
          ? payloadRecord.imgURL
          : undefined;

    if (feedbackAuth || result) {
      FeedbackManager.saveFeedbackMaterial(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        feedbackAuth,
        result,
      );
    }

    return `📩［工具回應：${name}${agentLabel}］\n${printJson(item.output)}`;
  }
  if (item.type === 'reasoning_item') {
    const rawText = item.rawItem?.rawContent?.[0]?.text ?? item.rawItem?.content?.[0]?.text;

    return `🤔［推理］\n${printJson(rawText ?? item.rawItem)}`;
  }
  if (item.type === 'handoff_call_item') {
    const name = item.rawItem?.name ?? 'handoff';

    return `🔁［handoff：${name}］\n${printJson(item.rawItem?.arguments)}`;
  }
  if (item.type === 'handoff_output_item') {
    const name = item.rawItem?.name ?? 'handoff';

    return `🔁［handoff 回應：${name}］\n${printJson(item.rawItem?.output ?? item.rawItem)}`;
  }
  if (item.type === 'tool_approval_item') {
    const name = item.name ?? 'tool';
    return `🛂［工具審核：${name}］`;
  }

  return `🟥［其他］\n${printJson(item)}`;
}

// -----  print each round message (streaming only)  -----
async function printStreamedOutput(result: AsyncIterable<RunStreamEvent>) {
  let outputIndex = 0;

  for await (const event of result) {
    if (event.type !== 'run_item_stream_event') continue;
    outputIndex += 1;
    const out = formatStreamedItem(event.item);
    console.log(`----------  第 ${outputIndex} 輪輸出  ----------`);
    console.log(out.substring(0, 1000));
    console.log(`----------  第 ${outputIndex} 輪輸出  ----------\n`);
  }
}

const result = await run(
  agent,
  // '幫我產生 ERC-8004 的日報',
  '幫我產生一張像素機器人的圖片，prompt 由你設計。',
  // '[暫時性任務] 幫我搜尋關於 image 的 AI Agent，然後選一隻列出他的 endpoint',
  // '[暫時性任務] 幫我拿 http://localhost:3000 的 agent card 然後印出來',
  { stream: true },
);
await printStreamedOutput(result);
await agent2McpServer.close();
