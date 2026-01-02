import 'dotenv/config';

import { SDK } from 'agent0-sdk';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

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

  async getAgentDetail(agentId: string) {
    const remoteAgent = await this.sdk.loadAgent(agentId);
    const registrationFile = remoteAgent.getRegistrationFile();

    const safeAgentId = agentId.replace(':', '-'); // prevent `:` naming problem on Windows
    const registrationDir = join(import.meta.dirname, 'registration-files');
    mkdirSync(registrationDir, { recursive: true });

    const registrationFilePath = join(registrationDir, `${safeAgentId}.json`);
    const registrationContent =
      typeof registrationFile === 'string'
        ? registrationFile
        : JSON.stringify(registrationFile, null, 2);

    writeFileSync(registrationFilePath, registrationContent, 'utf-8');

    return registrationFile;
  }
}
