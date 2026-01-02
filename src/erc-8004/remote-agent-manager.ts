import 'dotenv/config';

import { SDK } from 'agent0-sdk';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

type EndpointRecord = {
  type?: string;
  value?: string;
};

function parseRegistrationRecord(registrationFile: unknown): Record<string, unknown> | undefined {
  if (!registrationFile || typeof registrationFile !== 'object') {
    if (typeof registrationFile !== 'string') return undefined;
    try {
      const parsed = JSON.parse(registrationFile);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
      return parsed as Record<string, unknown>;
    } catch {
      return undefined;
    }
  }

  if (Array.isArray(registrationFile)) return undefined;
  return registrationFile as Record<string, unknown>;
}

function extractMcpBaseUrlFromRegistration(record: Record<string, unknown>): string | undefined {
  const endpoints = Array.isArray(record.endpoints) ? record.endpoints : [];
  const target = endpoints.find(
    (endpoint) => (endpoint as EndpointRecord | undefined)?.type === 'MCP',
  );
  const value =
    target && typeof target === 'object' && !Array.isArray(target)
      ? (target as EndpointRecord).value
      : undefined;
  return typeof value === 'string' ? value : undefined;
}

export function getAgentIdByBaseUrl(baseUrl: string): string | undefined {
  const domainMapPath = join(import.meta.dirname, 'base-url-to-agent-id.json');
  if (!existsSync(domainMapPath)) return undefined;
  try {
    const raw = readFileSync(domainMapPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
    const agentId = (parsed as Record<string, unknown>)[baseUrl];
    return typeof agentId === 'string' ? agentId : undefined;
  } catch {
    return undefined;
  }
}

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

    const saveAgentId = agentId.replace(':', '-'); // prevent `:` naming problem on Windows
    const registrationDir = join(import.meta.dirname, 'registration-files');
    mkdirSync(registrationDir, { recursive: true });

    const registrationFilePath = join(registrationDir, `${saveAgentId}.json`);
    const registrationContent =
      typeof registrationFile === 'string'
        ? registrationFile
        : JSON.stringify(registrationFile, null, 2);

    writeFileSync(registrationFilePath, registrationContent, 'utf-8');

    const registrationRecord = parseRegistrationRecord(registrationFile);
    if (registrationRecord) {
      const mcpBaseUrl = extractMcpBaseUrlFromRegistration(registrationRecord);
      if (mcpBaseUrl) {
        const domainMapPath = join(import.meta.dirname, 'base-url-to-agent-id.json');
        let domainMap: Record<string, string> = {};
        if (existsSync(domainMapPath)) {
          try {
            const raw = readFileSync(domainMapPath, 'utf-8');
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              domainMap = parsed as Record<string, string>;
            }
          } catch {}
        }

        domainMap[mcpBaseUrl] = agentId;
        writeFileSync(domainMapPath, JSON.stringify(domainMap, null, 2), 'utf-8');
      }
    }

    return registrationFile;
  }
}
