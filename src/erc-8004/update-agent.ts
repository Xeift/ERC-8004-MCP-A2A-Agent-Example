import 'dotenv/config';

import { SDK } from 'agent0-sdk';
import { getAgentId } from './agent-id-manager.js';

async function main() {
  const agentName = process.argv[3];
  if (!agentName) {
    throw new Error(`
      Please specify the name of the agent you want to register.
      Example: npm run update -- --name agent1
      Change this to your agent name      👆
      `);
  }

  const agentId = getAgentId(agentName);
  if (!agentId) throw new Error(`Missing agentId. You need to register ${agentName} first!`);

  const sdk = new SDK({
    chainId: Number(process.env.CHAIN_ID),
    rpcUrl: process.env.RPC_URL!,
    signer: process.env[`A${agentName?.slice(5)}_PRIVATE_KEY`]!,
    ipfs: 'pinata',
    pinataJwt: process.env.PINATA_JWT!,
  });

  const agent = await sdk.loadAgent(agentId);

  console.log(`Loaded agent: ${agent.name}`);
  console.log(`Current description: ${agent.description}`);

  agent.setX402Support(true);

  agent.setMetadata({
    version: '1.1.0',
    category: 'ai-assistant',
    pricing: '0.002',
    agentId: agentId,
  });

  console.log('Updating agent registration...');
  const updatedRegistrationFile = await agent.registerIPFS();
  console.log(`Agent updated. New URI: ${updatedRegistrationFile.agentURI}`);
}

main().catch(console.error);
