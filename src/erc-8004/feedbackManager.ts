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

    async giveFeedback() {

    }
}

