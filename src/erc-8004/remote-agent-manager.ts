import 'dotenv/config';

import { SDK } from 'agent0-sdk';

export class RemoteAgentManager {
    sdk: SDK;
    selfAgentName: string;

    constructor(selfAgentName: string, privateKey: string) {
        this.selfAgentName = selfAgentName;
        this.sdk = new SDK({
            chainId: Number(process.env.CHAIN_ID),
            rpcUrl: process.env.RPC_URL!,
            signer: privateKey,
            ipfs: 'pinata',
            pinataJwt: process.env.PINATA_JWT!,
        });
    }

    async searchAgent(keyword: string) {
        const nameResults = await this.sdk.searchAgents({ name: keyword }, undefined, 200);

        return nameResults.items;
    }
}