import { Command } from 'commander';
import path from 'path';
import { loadConfig, saveConfig, cortexHome } from '../utils/config.js';
import { ui } from '../ui/renderer.js';
import type { AIProviderName } from '../types.js';

export function configCommand(): Command {
    const cmd = new Command('config');
    cmd.description('Manage Cortex configuration')
        .option('--set-key <key>', 'Set API key (for openai / anthropic providers)')
        .option('--set-ai <provider>', 'Set default AI provider: ollama, openai, anthropic')
        .option('--set-model <model>', 'Set default model name (e.g. llama3.2, gpt-4o)')
        .option('--set-artifacts-dir <path>', 'Set custom local directory to save artifacts')
        .option('--set-session-dir <path>', 'Set custom local directory to save artifacts (alias)')
        .option('--show', 'Show current config')
        .action(async (options) => {
            const validProviders: AIProviderName[] = ['ollama', 'openai', 'anthropic'];

            if (options.setAi) {
                if (!validProviders.includes(options.setAi as AIProviderName)) {
                    ui.error(`Unknown provider "${options.setAi}". Valid: ollama, openai, anthropic`);
                    return;
                }
                await saveConfig({ aiProvider: options.setAi as AIProviderName });
                ui.success(`AI provider set to: ${options.setAi}`);
            }

            if (options.setModel) {
                await saveConfig({ aiModel: options.setModel });
                ui.success(`AI model set to: ${options.setModel}`);
            }

            if (options.setKey) {
                await saveConfig({ aiKey: options.setKey, openaiApiKey: options.setKey });
                ui.success('API key saved to ~/.cortex/config.json');
            }

            const setDir = options.setArtifactsDir || options.setSessionDir;
            if (setDir) {
                const absolutePath = path.resolve(setDir);
                await saveConfig({ sessionDir: absolutePath });
                ui.success(`Artifacts directory set to: ${absolutePath}`);
            }

            if (options.show) {
                const config = await loadConfig();
                console.log('');
                ui.info(`Config:     ${cortexHome()}/config.json`);
                ui.info(`Sessions:   ${config.sessionDir}`);
                ui.info(`AI:         ${config.aiProvider ?? 'ollama (default)'}`);
                ui.info(`Model:      ${config.aiModel ?? '(default for provider)'}`);
                const key = config.aiKey || config.openaiApiKey;
                ui.info(`API Key:    ${key ? '...' + key.slice(-4) : '(not set)'}`);
                ui.info(`Targets:    ${config.allowedTargets.join(', ')}`);
                console.log('');
                return;
            }

            // If nothing was set or shown, print help
            if (!options.setAi && !options.setModel && !options.setKey && !options.show && !setDir) {
                cmd.help();
            }
        });
    return cmd;
}