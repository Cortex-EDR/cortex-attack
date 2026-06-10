import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { CortexConfig } from '../types.js';

const CORTEX_HOME = path.join(os.homedir(), '.cortex');
const CONFIG_FILE = path.join(CORTEX_HOME, 'config.json');

const DEFAULTS: Partial<CortexConfig> = {
    sessionDir: path.join(CORTEX_HOME, 'sessions'),
    allowedTargets: ['localhost', '127.0.0.1', '::1'],
    maxConcurrentTools: 2,
    timeout: 120,
};

export async function loadConfig(): Promise<CortexConfig> {
    await fs.ensureDir(CORTEX_HOME);
    await fs.ensureDir(DEFAULTS.sessionDir!);
    if (!(await fs.pathExists(CONFIG_FILE))) {
        const blank: CortexConfig = { openaiApiKey: process.env.OPENAI_API_KEY || '', ...DEFAULTS } as CortexConfig;
        await fs.writeJson(CONFIG_FILE, blank, { spaces: 2 });
        return blank;
    }
    const stored = await fs.readJson(CONFIG_FILE) as Partial<CortexConfig>;
    return { ...DEFAULTS, ...stored, openaiApiKey: process.env.OPENAI_API_KEY || stored.openaiApiKey || '' } as CortexConfig;
}

export async function saveConfig(config: Partial<CortexConfig>): Promise<void> {
    await fs.ensureDir(CORTEX_HOME);
    const existing = await fs.pathExists(CONFIG_FILE) ? await fs.readJson(CONFIG_FILE) : {};
    await fs.writeJson(CONFIG_FILE, { ...existing, ...config }, { spaces: 2 });
}

export function cortexHome(): string { return CORTEX_HOME; }

export function isLocalhostTarget(target: string): boolean {
    const hostname = target.replace(/^https?:\/\//, '').split(':')[0];
    return ['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(hostname);
}