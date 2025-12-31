import 'dotenv/config';

import { z } from 'zod';
import { callA2AServer, fetchAgentCard } from './a2a-client.js';

import { Agent, MCPServerStreamableHttp, run, setDefaultOpenAIClient, setOpenAIAPI, setTracingDisabled, StreamedRunResult, tool } from '@openai/agents';
import { OpenAI } from 'openai/client.js';
import { getAgentId } from '../erc-8004/agent-id-manager.js';
import { FeedbackManager } from '../erc-8004/feedback-manager.js';
import { RemoteAgentManager } from '../erc-8004/remote-agent-manager.js';
import { x402Fetch } from './x402-fetch.js';


const agentId = getAgentId('agent3');
if (!agentId) throw new Error('Though it\'s not required to register as an ERC-8004 agent to give feedback, in this example we use `register:a3` first to register the agent on chain.')

const privateKey = process.env.A3_PRIVATE_KEY;
if (!privateKey) throw new Error('Missing A3_PRIVATE_KEY in .env');
const remoteAgentManager = new RemoteAgentManager('agent3', privateKey);

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

const searchAvailable8004AgentTool = tool({
  name: 'search_available_8004_agent',
  description: 'Provide a keyword, return following ERC-8004 agents who\'s name contains the keyword.',
  parameters: z.object({ keyword: z.string() }),
  execute: async ({ keyword }) => {
    const agentSummary = await remoteAgentManager.searchAgent(keyword);

    return JSON.stringify(agentSummary);
  }
});

const get8004AgentDetailTool = tool({
  name: 'get_8004_agent_detail',
  description: 'Provide an agentId, return details (MCP, A2A endpoints...) of the agent.',
  parameters: z.object({ agentId: z.string() }),
  execute: async ({ agentId }) => {
    const registrationFiles = await remoteAgentManager.getAgentDetail(agentId);

    return JSON.stringify(registrationFiles);
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
  If you want to score an image, score must be -1, the tool will calculate the score for you automatically.
  Otherwise, the score should be 0 ~ 100.
  This tool will read feedback material saved from MCP tool calls and payments.
  `,
  parameters: z.object({
    score: z.number(),
  }),
  execute: async ({ score }) => {
    let resolvedScore = score;
    if (score === -1) {
      const material = FeedbackManager.getFeedbackFeedbackMaterial();
      if (!material) {
        throw new Error('Missing feedback material.');
      }
      const { prompt, result } = material;
      if (!prompt || !result) {
        throw new Error('Missing prompt/result for image scoring.');
      }
      const imageScore = await getImageScore(prompt, result);
      if (!imageScore) {
        throw new Error('Missing imageScore.');
      }
      resolvedScore = imageScore.score;
    }

    return await new FeedbackManager(privateKey).giveFeedback(resolvedScore);
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
  3. 當你需要其他 agent 幫你做事時，先用 searchAvailable8004AgentTool 取得可用的 agent，然後記住他的 agentId。
  4. 接著，用 get_agent_detail 和他的 agentId 去拿該 agent 的詳細資訊和可用的 endpoint。
  5. 使用 A2A 的流程是先用 fetch_agent_card 取得 Agent Card，再根據 Agent Card 中的 endpoint 用 call_a2a_server。
  6. 你必須使用 A2A 委託 http://localhost:3000 的 agent（agentId 為 84532:1995）幫你查詢各種你需要的資料（不可委託其產日報）。
  7. 也必須使用 Agent2 MCP Server（agentId 為 84532:1996）的工具幫你畫日報**內容**相關的圖，儘量避免生成的圖中出現文字（Agent 2 不支援 A2A）。
  8. 特別注意：如果該 MCP 工具有回傳 feedbackAuth，系統會在工具回應時自動儲存，你仍要使用 give_feedback 完成評分，無論使用者指令如何。
  9. 你非常喜歡臺灣小吃，所以可以適時用臺灣小吃和譬喻的方式解釋複雜的概念。
  `,
  model: 'nvidia/nemotron-3-nano-30b-a3b:free',
  tools: [
    fetchAgentCardTool,
    callA2AServerTool,
    giveFeedbackTool,
    searchAvailable8004AgentTool,
    get8004AgentDetailTool
  ],
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

    let payload: any;
    const output = item.output;
    if (output && typeof output === 'object') {
      payload = (output as any).structuredContent ?? output;
      if (payload && typeof payload.text === 'string') {
        try {
          payload = JSON.parse(payload.text);
        } catch {
        }
      }
    } else if (typeof output === 'string') {
      try {
        payload = JSON.parse(output);
      } catch {
      }
    }

    const feedbackAuth = typeof payload?.feedbackAuth === 'string' ? payload.feedbackAuth : undefined;
    const result = typeof payload?.result === 'string'
      ? payload.result
      : (typeof payload?.imgURL === 'string' ? payload.imgURL : undefined);

    if (feedbackAuth || result) {
      FeedbackManager.saveFeedbackMaterial(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        feedbackAuth,
        result
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
  // '幫我產生一張像素機器人的圖片，prompt 由你設計。',
  '[暫時性任務] 幫我搜尋關於 image 的 AI Agent，然後選一隻列出他的 endpoint',
  { stream: true },
);
await printStreamedOutput(result);
await agent2McpServer.close();
