#!/usr/bin/env node

import { Command } from 'commander';
import { runAttack, AttackOptions } from './engines/orchestrator.js';
import { explainCommand } from './commands/explain.js';
import { reportCommand } from './commands/report.js';
import { sessionsCommand, timelineCommand } from './commands/sessions.js';
import { configCommand } from './commands/config.js';
import { ui } from './ui/renderer.js';
import type { AIProviderName } from './types.js';

const program = new Command();

program
    .name('cortex')
    .description('Terminal-native security intelligence engine')
    .version('0.1.0');

program
    .command('attack <target>')
    .description('Run a full passive security assessment against a localhost target')
    .option('--cwd <path>', 'Project directory for code/dependency analysis')
    .option('--verbose', 'Show all tool output')
    .option('--ai <provider>', 'AI provider: ollama (default), openai, anthropic')
    .option('--model <name>', 'Model name override (e.g. qwen2.5:7b, gpt-4o)')
    .option('--key <apiKey>', 'API key for openai or anthropic providers')
    .option('--artifacts-dir <path>', 'Custom local directory to save assessment artifacts')
    .action(async (target: string, options: AttackOptions & { ai?: string; artifactsDir?: string }) => {
        // Validate provider value early
        const validProviders: AIProviderName[] = ['ollama', 'openai', 'anthropic'];
        if (options.ai && !validProviders.includes(options.ai as AIProviderName)) {
            ui.error(`Unknown AI provider: "${options.ai}". Valid: ollama, openai, anthropic`);
            process.exit(1);
        }
        try {
            await runAttack(target, {
                cwd: options.cwd,
                verbose: options.verbose,
                ai: options.ai as AIProviderName | undefined,
                model: options.model,
                key: options.key,
                artifactsDir: options.artifactsDir,
            });
        } catch (err) {
            ui.error(`Fatal: ${(err as Error).message}`);
            process.exit(1);
        }
    });

program.addCommand(explainCommand());
program.addCommand(reportCommand());
program.addCommand(sessionsCommand());
program.addCommand(timelineCommand());
program.addCommand(configCommand());

program
    .command('doctor')
    .description('Check system dependencies and configuration')
    .action(async () => {
        const { checkAvailableTools, isDockerAvailable } = await import('./engines/toolRunner.js');
        const { loadConfig } = await import('./utils/config.js');
        console.log('');
        ui.info('Checking Cortex environment...');
        console.log('');

        // Tools
        const tools = await checkAvailableTools();
        for (const [tool, available] of Object.entries(tools)) {
            if (available) ui.success(`${tool.padEnd(12)} installed`);
            else ui.warn(`${tool.padEnd(12)} not found`);
        }
        console.log('');

        // Docker
        const docker = await isDockerAvailable();
        if (docker) ui.success(`${'docker'.padEnd(12)} available (tool fallback ready)`);
        else ui.warn(`${'docker'.padEnd(12)} not found — missing tools will be skipped`);
        console.log('');

        // Config / AI
        const config = await loadConfig();
        const provider = config.aiProvider ?? 'ollama';
        ui.info(`AI provider:  ${provider}`);
        ui.info(`AI model:     ${config.aiModel ?? '(default for provider)'}`);
        if (provider === 'openai' || provider === 'anthropic') {
            const key = config.aiKey || config.openaiApiKey;
            if (key) ui.success(`API key       set (...${key.slice(-4)})`);
            else ui.error(`API key       NOT SET — run: cortex config --set-key <key>`);
        } else {
            ui.info('API key:      not required for Ollama');
        }
        console.log('');
        ui.info('Install missing tools:');
        ui.info('  nmap:    brew install nmap / apt install nmap');
        ui.info('  nikto:   brew install nikto / apt install nikto');
        ui.info('  trivy:   https://trivy.dev/latest/getting-started/installation/');
        ui.info('  semgrep: pip install semgrep');
        ui.info('  Or: just have Docker installed — cortex will use the cortex-engine image');
        console.log('');
        ui.info('Install Ollama (recommended AI backend):');
        ui.info('  https://ollama.com  →  ollama pull llama3.2');
        console.log('');
    });

program.parse(process.argv);