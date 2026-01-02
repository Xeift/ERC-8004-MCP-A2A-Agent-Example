import { Agent, run, tool } from '@openai/agents';
import { z } from 'zod';
import { FeedbackManager } from '../../erc-8004/feedback-manager.js';

export function giveFeedbackTool(feedbackManager: FeedbackManager) {
  return tool({
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

      return await feedbackManager.giveFeedback(resolvedScore);
    },
  });
}

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
