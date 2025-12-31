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

    async giveFeedback(score: number) {
        const material = FeedbackManager.getFeedbackFeedbackMaterial();
        if (!material || Object.keys(material).length === 0) {
            return 'no feedback need to submit!';
        }
        const { agentId, feedbackAuth, txHash, amount } = material;
        if (!agentId) throw new Error('Missing agentId.');
        if (!feedbackAuth) throw new Error('Missing feedbackAuth.');
        if (!txHash) throw new Error('Missing txHash.');
        if (amount === undefined) throw new Error('Missing amount.');
        const amountValue = String(amount);

        // important: prevent "agentRegistry": "eip155:0:0x0",
        const chainId = await this.sdk.chainId();
        const identityRegistry = this.sdk.registries().IDENTITY;

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
            { txHash, amount: amountValue }, // x402 proofOfPayment
            identityRegistry ? { agentRegistry: `eip155:${chainId}:${identityRegistry}` } : undefined // need to pass identityRegistry
        );

        console.log('----------  ERC-8004 Feedback  ----------');
        console.log('Submitting feedback');
        console.log(`agentId: ${agentId} `);
        console.log(`score: ${score} `);
        console.log(`feedbackAuth: ${feedbackAuth} `);
        console.log(`txHash: ${txHash} `);
        console.log(`amount: ${amountValue} `);
        const feedback = await this.sdk.giveFeedback(agentId, feedbackFile, feedbackAuth);
        const result = `Feedback submitted with ID: ${feedback.id.join(':')}\n` +
            `IPFS URL: ${feedback.fileURI?.replace('ipfs://', 'https://ipfs.io/ipfs/')}`;
        console.log(result);
        console.log('----------  ERC-8004 Feedback  ----------\n');
        FeedbackManager.clearFeedbackMaterial(); // prevent agent submit feedback again and again

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
        };

        writeFileSync(fileName, JSON.stringify(data, null, 2), 'utf-8');
    }

    static getFeedbackFeedbackMaterial(): Feedback | undefined {
        const fileName = join(import.meta.dirname, 'feedback-queue.json');
        if (!existsSync(fileName)) return undefined;
        try {
            const raw = readFileSync(fileName, 'utf-8');
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
            return getLatestFeedbackFromRecord(parsed as Record<string, unknown>);
        } catch {
            return undefined;
        }
    }

    static clearFeedbackMaterial() {
        const fileName = join(import.meta.dirname, 'feedback-queue.json');
        writeFileSync(fileName, '{}', 'utf-8');
    }
}
