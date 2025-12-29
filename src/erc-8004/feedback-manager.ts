import 'dotenv/config';

import { SDK } from 'agent0-sdk';

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

        console.log('Submitting feedback...');
        const feedback = await this.sdk.giveFeedback(agentId, feedbackFile, feedbackAuth);
        console.log(`Feedback submitted with ID: ${feedback.id.join(':')}`);
        console.log(`Score: ${feedback.score}, Tags: ${feedback.tags}`);
    }
}

