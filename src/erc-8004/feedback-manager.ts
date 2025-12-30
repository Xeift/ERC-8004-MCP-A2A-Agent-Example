import 'dotenv/config';

import { SDK } from 'agent0-sdk';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

type Feedback = {
    agentId?: string,
    result?: string;
    amount?: number;
    txHash?: string;
    payer?: string;
    prompt?: string;
    feedbackAuth?: string;
    score?: number;
};

const FEEDBACK_FIELDS: Array<keyof Feedback> = [
    'agentId',
    'result',
    'amount',
    'txHash',
    'payer',
    'prompt',
    'feedbackAuth',
    'score',
];

function isFeedbackRecord(value: unknown): value is Feedback {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const record = value as Partial<Record<string, unknown>>;
    return FEEDBACK_FIELDS.some((key) => key in record);
}

function getLatestFeedbackFromRecord(record: Record<string, unknown>): Feedback | undefined {
    if (isFeedbackRecord(record)) return record;

    const candidates = Object.values(record).filter((value) => isFeedbackRecord(value));
    if (candidates.length === 0) return undefined;
    return candidates[candidates.length - 1] as Feedback;
}

export class FeedbackManager {
    sdk: SDK;

    constructor(privateKey: string) {
        this.sdk = new SDK({
            chainId: Number(process.env.CHAIN_ID),
            rpcUrl: process.env.RPC_URL!,
            signer: privateKey,
            ipfs: 'pinata',
            pinataJwt: process.env.PINATA_JWT!,
        });
    }

    async signFeedbackAuth(agentId: string, clientAddress: string): Promise<string> {
        const feedbackAuth = await this.sdk.signFeedbackAuth(agentId, clientAddress);
        return feedbackAuth;
    }

    async giveFeedback(agentId: string, score: number, feedbackAuth: string, txHash: string, amount: string) {
        const feedbackFile = this.sdk.prepareFeedback(
            agentId,
            score,
            undefined, // tags
            undefined, // text
            undefined, // capability
            undefined, // name
            undefined, // skill
            undefined, // task
            undefined, // context
            { txHash, amount } // x402 proofOfPayment
        );

        console.log('----------  ERC-8004 Feedback  ----------');
        console.log('Submitting feedback');
        console.log(`agentId: ${agentId}`);
        console.log(`score: ${score}`);
        console.log(`feedbackAuth: ${feedbackAuth}`);
        console.log(`txHash: ${txHash}`);
        console.log(`amount: ${amount}`);
        const feedback = await this.sdk.giveFeedback(agentId, feedbackFile, feedbackAuth);
        const result = `Feedback submitted with ID: ${feedback.id.join(':')}`;
        console.log(result);
        console.log('----------  ERC-8004 Feedback  ----------');

        return result;
    }

    static saveFeedbackMaterial(
        agentId?: string,
        prompt?: string,

        amount?: number,
        txHash?: string,
        payer?: string,

        feedbackAuth?: string,
        result?: string,

        score?: number,
    ) {
        const fileName = join(import.meta.dirname, 'feedback-queue.json');
        let data: Feedback = {};
        if (existsSync(fileName)) {
            const raw = readFileSync(fileName, 'utf-8');
            const parsed = JSON.parse(raw) as Record<string, unknown>;
            const latest = getLatestFeedbackFromRecord(parsed);
            if (latest) {
                data = latest;
            }
        }

        data = {
            ...data,
            ...(agentId !== undefined && { agentId }),
            ...(amount !== undefined && { amount }),
            ...(txHash !== undefined && { txHash }),
            ...(payer !== undefined && { payer }),
            ...(prompt !== undefined && { prompt }),

            ...(result !== undefined && { result }),
            ...(feedbackAuth !== undefined && { feedbackAuth }),
            ...(score !== undefined && { score }),
        };

        writeFileSync(fileName, JSON.stringify(data, null, 2), 'utf-8');
    }
}
