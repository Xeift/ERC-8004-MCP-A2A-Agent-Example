import 'dotenv/config';

import { AGENT_CARD_PATH } from '@a2a-js/sdk';
import { SDK } from 'agent0-sdk';
import { saveAgentId } from './agent-id-manager.js';

// Initialize SDK with IPFS and subgraph
const sdk = new SDK({
    chainId: Number(process.env.CHAIN_ID),
    rpcUrl: process.env.RPC_URL!,
    signer: process.env.A1_PRIVATE_KEY!,
    ipfs: 'pinata',
    pinataJwt: process.env.PINATA_JWT!,
});

// Create agent
const agent = sdk.createAgent(
    'Crypto Data Agent',
    'A crypto data agent that provides cryptocurrency prices in USD and retrieves the latest Ethereum block number. Powered by Coingecko API and Ethereum RPC. Supports ERC-8004, MCP, and A2A.',
    'https://raw.githubusercontent.com/Xeift/ERC-8004-MCP-A2A-Agent-Example/refs/heads/develop/src/agent1/agent1_pfp.png'
);

// Configure endpoints (automatically extracts capabilities)
const PORT = process.env.A1_SERVER_PORT;
await agent.setMCP(`http://localhost:${PORT}/mcp`);
await agent.setA2A(`http://localhost:${PORT}/${AGENT_CARD_PATH}`);
agent.setENS('agent00001.eth');

// Add OASF skills and domains (standardized taxonomies)
agent.addSkill('tool_interaction/api_schema_understanding', true)
agent.addSkill('tool_interaction/script_integration', true)
agent.addSkill('tool_interaction/workflow_automation', true)
agent.addSkill('natural_language_processing/natural_language_generation/dialogue_generation', true)
agent.addSkill('natural_language_processing/natural_language_understanding/semantic_understanding', true)
agent.addSkill('natural_language_processing/natural_language_generation/summarization', true);
agent.addSkill('tool_interaction/tool_use_planning', true);
agent.addSkill('natural_language_processing/information_retrieval_synthesis/question_answering', true);
agent.addDomain('technology/blockchain/blockchain', true);
agent.addDomain('technology/blockchain/cryptocurrency', true);

// Configure wallet and trust
agent.setAgentWallet(process.env.A1_ADDRESS!, Number(process.env.CHAIN_ID));
agent.setTrust(true, false, false); // reputation, cryptoEconomic, teeAttestation

// Add metadata and set status
agent.setMetadata({ version: '1.0.0', category: 'ai-assistant' });
agent.setActive(true);

// Register on-chain with IPFS
const registrationFile = await agent.registerIPFS();
console.log('----------  Agent1 Registered  ----------');
console.log(`Agent registered: ${registrationFile.agentId}`);
console.log(`Agent URI: ${registrationFile.agentURI?.replace(
    'ipfs://',
    'https://ipfs.io/ipfs/'
)}`);
saveAgentId('agent1', registrationFile.agentId!)
console.log('AgentId has been saved to agent-id.json');
console.log('----------  Agent1 Registered  ----------');
