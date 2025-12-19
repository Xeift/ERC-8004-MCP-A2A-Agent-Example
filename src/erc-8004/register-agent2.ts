import 'dotenv/config';

import { AGENT_CARD_PATH } from '@a2a-js/sdk';
import { SDK } from 'agent0-sdk';
import { saveAgentId } from './agent-id-manager.js';

// Initialize SDK with IPFS and subgraph
const sdk = new SDK({
    chainId: 11155111,
    rpcUrl: 'https://ethereum-sepolia-public.nodies.app',
    signer: process.env.A2_PRIVATE_KEY!,
    ipfs: 'pinata',
    pinataJwt: process.env.PINATA_JWT!,
});

// Create agent
const agent = sdk.createAgent(
    'Image Generation Agent',
    'Image Generation Agent is a minimal MCP agent that generates an image from a text prompt, uploads it to an image hosting service, and returns the image URL over HTTP. Supports ERC-8004 and MCP.',
    'https://raw.githubusercontent.com/Xeift/ERC-8004-MCP-A2A-Agent-Example/refs/heads/develop/src/agent2/agent2_pfp.png'
);

// Configure endpoints (automatically extracts capabilities)
const PORT = process.env.A2_SERVER_PORT;
await agent.setMCP(`http://localhost:${PORT}/mcp`);
await agent.setA2A(`http://localhost:${PORT}/${AGENT_CARD_PATH}`);
agent.setENS('agent00002.eth');

// Add OASF skills and domains (standardized taxonomies)
agent.addSkill('tool_interaction/script_integration', true);
agent.addSkill('tool_interaction/workflow_automation', true);
agent.addSkill('multi_modal/image_processing/text_to_image', true);
agent.addDomain('media_and_entertainment/content_creation', true);
agent.addDomain('media_and_entertainment/digital_media', true);
agent.addDomain('technology/software_engineering/apis_integration', true);

// Configure wallet and trust
agent.setAgentWallet(process.env.A2_ADDRESS!, 11155111);
agent.setTrust(true, false, false); // reputation, cryptoEconomic, teeAttestation

// Add metadata and set status
agent.setMetadata({ version: '1.0.0', category: 'ai-assistant' });
agent.setActive(true);

// Register on-chain with IPFS
const registrationFile = await agent.registerIPFS();
console.log('----------  Agent2 Registered  ----------');
console.log(`Agent registered: ${registrationFile.agentId}`);
console.log(`Agent URI: ${registrationFile.agentURI?.replace(
    'ipfs://',
    'https://ipfs.io/ipfs/'
)}`);
saveAgentId('agent2', registrationFile.agentId!)
console.log('AgentId has been saved to agent-id.json');
console.log('----------  Agent2 Registered  ----------');
