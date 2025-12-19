import 'dotenv/config';

import { SDK } from 'agent0-sdk';
import { saveAgentId } from './agent-id-manager.js';

// Initialize SDK with IPFS and subgraph
const sdk = new SDK({
    chainId: 11155111,
    rpcUrl: 'https://ethereum-sepolia-public.nodies.app',
    signer: process.env.A3_PRIVATE_KEY!,
    ipfs: 'pinata',
    pinataJwt: process.env.PINATA_JWT!,
});

// Create agent
const agent = sdk.createAgent(
    'Web3 News Assistant',
    'A client agent that generates a daily report for a given topic by orchestrating external A2A agents for live crypto/on-chain data retrieval and image generation, then synthesizing the results into a concise, reader-friendly summary. Supports ERC-8004, A2A client and MCP client.',
    'https://raw.githubusercontent.com/Xeift/ERC-8004-MCP-A2A-Agent-Example/refs/heads/develop/src/agent3/agent3_pfp.png'
);

// Configure endpoints (automatically extracts capabilities)
// Since agent3 is client agent, it does not have MCP or A2A endpoints
agent.setENS('agent00003.eth');

// Add OASF skills and domains (standardized taxonomies)
agent.addSkill('natural_language_processing/natural_language_generation/summarization', true);
agent.addSkill('natural_language_processing/information_retrieval_synthesis/knowledge_synthesis', true);
agent.addSkill('natural_language_processing/information_retrieval_synthesis/search', true);
agent.addSkill('tool_interaction/api_schema_understanding', true);
agent.addSkill('tool_interaction/tool_use_planning', true);
agent.addSkill('tool_interaction/script_integration', true);
agent.addSkill('tool_interaction/workflow_automation', true);
agent.addSkill('agent_orchestration/task_decomposition', true);
agent.addSkill('agent_orchestration/role_assignment', true);
agent.addSkill('agent_orchestration/multi_agent_planning', true);
agent.addSkill('agent_orchestration/agent_coordination', true);
agent.addSkill('multi_modal/image_processing/text_to_image', true);
agent.addSkill('retrieval_augmented_generation/retrieval_of_information/search', true);
agent.addSkill('retrieval_augmented_generation/generation_of_any', true);
agent.addDomain('technology/blockchain/blockchain', true);
agent.addDomain('technology/blockchain/smart_contracts', true);
agent.addDomain('technology/blockchain/cryptocurrency', true);
agent.addDomain('finance_and_business/finance', true);
agent.addDomain('media_and_entertainment/content_creation', true);
agent.addDomain('media_and_entertainment/publishing', true);
agent.addDomain('technology/software_engineering/apis_integration', true);
agent.addDomain('technology/automation/workflow_automation', true);

// Configure wallet and trust
agent.setAgentWallet(process.env.A3_ADDRESS!, 11155111);
agent.setTrust(true, false, false); // reputation, cryptoEconomic, teeAttestation

// Add metadata and set status
agent.setMetadata({ version: '1.0.0', category: 'ai-assistant' });
agent.setActive(true);

// Register on-chain with IPFS
const registrationFile = await agent.registerIPFS();
console.log('----------  Agent3 Registered  ----------');
console.log(`Agent registered: ${registrationFile.agentId}`);
console.log(`Agent URI: ${registrationFile.agentURI?.replace(
    'ipfs://',
    'https://ipfs.io/ipfs/'
)}`);
saveAgentId('agent3', registrationFile.agentId!)
console.log('AgentId has been saved to agent-id.json');
console.log('----------  Agent3 Registered  ----------');
