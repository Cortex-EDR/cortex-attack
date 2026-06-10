import { Command } from 'commander';
import fs from 'fs-extra';
import path from 'path';
import { loadConfig } from '../utils/config.js';
import { AIReasoningEngine } from '../engines/aiReasoning.js';
import { Finding, SessionData } from '../types.js';
import { ui } from '../ui/renderer.js';
import type { AIProviderName } from '../types.js';

export function explainCommand(): Command {
    const cmd = new Command('explain');
    cmd.description('Deep-dive AI explanation of a finding')
        .option('--finding <id>', 'Finding ID')
        .option('--session <id>', 'Session ID')
        .option('--ai <provider>', 'AI provider: ollama (default), openai, anthropic')
        .option('--model <name>', 'Model name override')
        .option('--key <apiKey>', 'API key for openai or anthropic providers')
        .action(async (options) => {
            const config = await loadConfig();

            const aiProvider: AIProviderName = (options.ai ?? config.aiProvider ?? 'ollama') as AIProviderName;
            const aiModel = options.model ?? config.aiModel ?? (aiProvider === 'openai' ? 'gpt-4o' : aiProvider === 'anthropic' ? 'claude-3-5-sonnet-20241022' : 'llama3.2');
            const aiKey = options.key ?? config.aiKey ?? config.openaiApiKey ?? '';

            if ((aiProvider === 'openai' || aiProvider === 'anthropic') && !aiKey) {
                ui.error(`--key <api-key> is required when using --ai ${aiProvider}`);
                process.exit(1);
            }

            const ai = new AIReasoningEngine({ provider: aiProvider, model: aiModel, apiKey: aiKey });

            const finding = await findFinding(config.sessionDir, options.finding, options.session);
            if (!finding) { ui.error(`Finding "${options.finding}" not found.`); process.exit(1); }

            ui.finding(finding);
            console.log('');
            ui.info('Requesting AI explanation...');
            try {
                const explanation = await ai.explainFinding(finding);
                ui.aiReasoning(`Finding ${finding.id}`, explanation);
            } catch {
                ui.warn('[AI SKIP] Ollama not running — install from ollama.com');
            }
        });
    return cmd;
}

async function findFinding(sessionDir: string, findingId?: string, sessionId?: string): Promise<Finding | null> {
    if (!findingId) return null;
    const sessions = sessionId
        ? [path.join(sessionDir, sessionId)]
        : (await fs.readdir(sessionDir)).map((d) => path.join(sessionDir, d));
    for (const sp of sessions) {
        const sf = path.join(sp, 'session.json');
        if (!(await fs.pathExists(sf))) continue;
        const session = (await fs.readJson(sf)) as SessionData;
        const found = session.findings.find(
            (f) => f.id === findingId || f.id.toLowerCase() === findingId.toLowerCase(),
        );
        if (found) return found;
    }
    return null;
}