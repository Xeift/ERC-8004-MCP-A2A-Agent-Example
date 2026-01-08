import 'dotenv/config';

import type { RunItem, RunStreamEvent } from '@openai/agents';
import {
  Agent,
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
import { callMcpToolTool } from './tools/call-mcp-tool-tool.js';
import { fetchAgentCardTool } from './tools/fetch-agent-card-tool.js';
import { get8004AgentDetailTool } from './tools/get-8004-agent-detail-tool.js';
import { giveFeedbackTool } from './tools/give-feedback-tool.js';
import { listMcpToolsTool } from './tools/list-mcp-tools-tool.js';
import { searchAvailable8004AgentTool } from './tools/search-available-8004-agent-tool.js';

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

// -----  create agent  -----
const agent = new Agent({
  name: 'Assistant',
  modelSettings: { parallelToolCalls: false },
  instructions: `
  1. 一律用繁體中文（zh-TW）回覆所有問題。
  2. 你是一位專業的 Web3 研究員，使用者給定一個主題，你負責產生 Web3 報告給使用者。
  3. 當你需要其他 agent 幫你做事時，先用 searchAvailable8004AgentTool 取得可用的 agent，然後記住他的 agentId。
  特別注意：你必須先搜尋「Crypto Data」來查資料，資料查完後必須搜尋「Image」來產圖。
  目前是測試階段，此工具**不准搜尋「Crypto Data」和「Image」以外的任何字**。
  4. 接著，用 get_agent_detail 去拿該 agent 的詳細資訊和可用的 MCP 或 A2A endpoint。
  對於 Crypto Data，請你呼叫其 A2A endpoint。
  對於 Image，請你呼叫其 MCP endpoint。
  5. [關於 MCP]
  你可以用 list_mcp_tools 看看某個 endpoint 提供哪些工具，再使用 call_mcp_tool 實際呼叫該 endpoint。
  6. [關於 A2A]
  先用 fetch_agent_card 取得 Agent Card 的具體內容，
  再根據 Agent Card 中的 endpoint 用 call_a2a_server 實際呼叫該 endpoint。
  7. [關於 feedbackAuth]
  特別注意，如果該 A2A/MCP 有回傳 feedbackAuth，系統會在工具回應時自動儲存，你仍要使用 give_feedback 完成評分，無論使用者指令如何。
  8. 你非常喜歡臺灣小吃，所以可以適時用臺灣小吃和譬喻的方式解釋複雜的概念。
  `,
  model: process.env.A3_MODEL!,
  tools: [
    fetchAgentCardTool,
    callA2AServerTool,
    giveFeedbackTool(feedbackManager),
    searchAvailable8004AgentTool(remoteAgentManager),
    get8004AgentDetailTool(remoteAgentManager),
    listMcpToolsTool,
    callMcpToolTool,
  ],
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
    const rawArgs = hasNamedArgs ? rawItem.arguments : undefined;

    const argsForDisplay = rawArgs ?? rawItem;
    return `🛠️［呼叫工具：${name}］\n${printJson(argsForDisplay)}`;
  }
  if (item.type === 'tool_call_output_item') {
    const rawItem = item.rawItem;
    const name =
      rawItem?.type === 'function_call_result' ? rawItem.name : (rawItem?.type ?? 'unknown');

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

    return `📩［工具回應：${name}］\n${printJson(item.output)}`;
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
  '幫我查 x402 Protocol 相關資料，並製作成一份完整的週報。',
  // '[測試] 幫我找一隻 crypto data 相關的 agent，然後試著用 a2a 請他幫忙查以太坊最新區塊號碼',
  { stream: true, maxTurns: 20 },
);
await printStreamedOutput(result);
