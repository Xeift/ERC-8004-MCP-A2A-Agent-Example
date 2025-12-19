import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

export function getAgentId(name: string): string | undefined {
    const fileName = join(import.meta.dirname, 'agent-id.json');

    let data: Record<string, string> = {};
    if (existsSync(fileName)) {
        const raw = readFileSync(fileName, 'utf-8');
        data = JSON.parse(raw);
    }

    return data[name];
}

export function saveAgentId(name: string, agentId: string) {
    const fileName = join(import.meta.dirname, 'agent-id.json');

    let data: Record<string, string> = {};
    if (existsSync(fileName)) {
        const raw = readFileSync(fileName, 'utf-8');
        data = JSON.parse(raw);
    }

    data[name] = agentId;

    writeFileSync(fileName, JSON.stringify(data), 'utf-8');
}