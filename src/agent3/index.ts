import 'dotenv/config';

import { z } from 'zod';
import { callA2AServer, fetchAgentCard } from './a2a-client.js';

import { Agent, MCPServerStreamableHttp, run, setDefaultOpenAIClient, setOpenAIAPI, setTracingDisabled, StreamedRunResult, tool } from '@openai/agents';
import { OpenAI } from 'openai/client.js';
import { getAgentId } from '../erc-8004/agent-id-manager.js';
import { FeedbackManager } from '../erc-8004/feedback-manager.js';
import { getLastX402PaymentInfo, x402Fetch } from './x402-fetch.js';


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
const openrouterClient = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY!,
});
setDefaultOpenAIClient(openrouterClient)

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

async function getImageScore(prompt: string, imageUrl: string) {
  const r = await run(
    new Agent({
      name: 'ImageScorer',
      model: 'nvidia/nemotron-nano-12b-v2-vl:free',
      modelSettings: { temperature: 0 },
      instructions: `根據以下 prompt 評分圖片符合度（0~100），並給 1~3 個簡短原因。\n\nprompt:\n${prompt}`,
      outputType: z.object({
        score: z.number().min(0).max(100),
        reasons: z.array(z.string()).min(1).max(3),
      }),
    }),
    [
      {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_image', image: imageUrl }],
      },
    ],
  );

  return r.finalOutput;
}

const giveFeedbackTool = tool({
  name: 'give_feedback',
  description: `
  Write feedback for the ERC-8004 AI Agent you used.
  agentId is the agent you interacted with,
  score should be 0 ~ 100, or -1 if you want to auto-score an image.
  feedbackAuth will be returned along with the response from other agent.
  When score is -1, prompt and imageUrl are required to compute the score.
  `,
  parameters: z.object({
    agentId: z.string(),
    score: z.number(),
    feedbackAuth: z.string(),
    prompt: z.string().optional(),
    imageUrl: z.string().url().optional(),
  }),
  execute: async ({ agentId, score, feedbackAuth, prompt, imageUrl }) => {
    let resolvedScore = score;
    if (score === -1) {
      if (!prompt || !imageUrl) {
        throw new Error('Missing prompt/imageUrl.');
      }
      const imageScore = await getImageScore(prompt, imageUrl);
      if (!imageScore) {
        throw new Error('Missing imageScore.');
      }
      resolvedScore = imageScore.score;
    }
    const paymentInfo = getLastX402PaymentInfo();
    const resolvedTxHash = paymentInfo?.txHash;
    const resolvedAmount = paymentInfo?.amount;
    if (!resolvedTxHash || !resolvedAmount) {
      throw new Error('Missing x402 payment info.');
    }
    return await new FeedbackManager(privateKey).giveFeedback(agentId, resolvedScore, feedbackAuth, resolvedTxHash, resolvedAmount);
  }
});

const saveFeedbackAuthTool = tool({
  name: 'save_feedback_auth',
  description: 'Only use this tool when received feedbackAuth. Save feedbackAuth and result for further use.',
  parameters: z.object({ feedbackAuth: z.string(), result: z.string() }),
  execute: async ({ feedbackAuth, result }) => {
    FeedbackManager.saveFeedbackMaterial(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      feedbackAuth,
      result
    );

    return 'Success!';
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
  3. 使用 A2A 的流程是先用 fetch_agent_card 取得 Agent Card，再根據 Agent Card 中的 endpoint 用 call_a2a_server。
  4. 你必須使用 A2A 委託 http://localhost:3000 的 agent（agentId 為 84532:1995）幫你查詢各種你需要的資料（不可委託其產日報）。
  5. 也必須使用 Agent2 MCP Server（agentId 為 84532:1996）的工具幫你畫日報**內容**相關的圖，儘量避免生成的圖中出現文字。
  6. 特別注意：如果該 MCP 工具有回傳 feedbackAuth，表示其支援 ERC-8004，則你必須使用 save_feedback_auth 工具儲存 feedbackAuth 和其他結果。
  7. 你非常喜歡臺灣小吃，所以可以適時用臺灣小吃和譬喻的方式解釋複雜的概念。
  `,
  // 如果 MCP 工具的回覆是文字，score 你可以自行判斷，然後使用 give_feedback 工具。
  // 如果 MCP 工具的回覆是圖片，請將 score 設為 -1，並提供 prompt 與 imageUrl，讓 give_feedback 自動計算 score。
  model: 'nvidia/nemotron-3-nano-30b-a3b:free',
  tools: [fetchAgentCardTool, callA2AServerTool, giveFeedbackTool, saveFeedbackAuthTool],
  mcpServers: [agent2McpServer]
});

function printJson(input: any): string {
  if (input !== null && typeof input === 'object') {
    return JSON.stringify(input)
  }
  return input;
}

function formatStreamedItem(item: any): string {
  if (item.type === 'message_output_item') {
    return `✅［模型回覆］\n${printJson(item.content)}`;
  }
  if (item.type === 'tool_call_item') {
    const name = item.rawItem?.name ?? 'unknown';
    const agentId = mcpToolAgentIdByName.get(name);
    const agentLabel = agentId ? ` (agentId: ${agentId})` : '';

    if (agentId) {
      const rawArgs = item.rawItem?.arguments;
      const prompt = typeof rawArgs === 'string' ? rawArgs : JSON.stringify(rawArgs);
      FeedbackManager.saveFeedbackMaterial(agentId, prompt);
    }

    return `🛠️［呼叫工具：${name}${agentLabel}］\n${printJson(item.rawItem?.arguments)}`;
  }
  if (item.type === 'tool_call_output_item') {
    const name = item.rawItem?.name ?? 'unknown';
    const agentId = mcpToolAgentIdByName.get(name);
    const agentLabel = agentId ? ` (agentId: ${agentId})` : '';

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
    const name = item.name ?? item.rawItem?.name ?? 'tool';
    return `🛂［工具審核：${name}］`;
  }

  return `🟥［其他］\n${printJson(item)}`;
}

// -----  print each round message (streaming only)  -----
async function printStreamedOutput(result: StreamedRunResult<any, Agent<any, any>>) {
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
  // '[暫時性任務] 幫我取得最新的以太坊區塊號碼。feedbackAuth 請你暫時印出來就好，不需要特別做處理。',
  { stream: true },
);
await printStreamedOutput(result);
await agent2McpServer.close();
