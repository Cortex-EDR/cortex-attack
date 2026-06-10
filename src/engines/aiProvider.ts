/**
 * AI Provider abstraction for cortex-cli.
 *
 * Default: Ollama at http://localhost:11434 (zero-cost, local).
 * Opt-in:  OpenAI or Anthropic via --ai flag + --key.
 *
 * Ollama uses the OpenAI-compatible /v1/chat/completions endpoint so no extra
 * npm packages are needed — everything is done with native fetch.
 */

export type AIProviderName = 'ollama' | 'openai' | 'anthropic';

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface AIProvider {
    name: AIProviderName;
    chat(messages: ChatMessage[], model: string, maxTokens?: number, temperature?: number): Promise<string>;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Returns true when the error looks like a model-not-found / 404 response. */
function isModelNotFound(err: unknown): boolean {
    const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
    return (
        msg.includes('404') ||
        msg.includes('model not found') ||
        msg.includes('unknown model') ||
        msg.includes('no such model') ||
        msg.includes('pull model')
    );
}

// ─── Ollama ───────────────────────────────────────────────────────────────────

const OLLAMA_BASE = 'http://localhost:11434';
const OLLAMA_PRIMARY_MODEL = 'llama3.2';
const OLLAMA_FALLBACK_MODEL = 'qwen2.5:7b';

export class OllamaProvider implements AIProvider {
    readonly name: AIProviderName = 'ollama';

    async chat(
        messages: ChatMessage[],
        model: string,
        maxTokens = 600,
        temperature = 0.3,
    ): Promise<string> {
        // Try the requested model; if not found fall back to the secondary model.
        const modelsToTry =
            model === OLLAMA_PRIMARY_MODEL
                ? [OLLAMA_PRIMARY_MODEL, OLLAMA_FALLBACK_MODEL]
                : [model]; // caller already specified an explicit custom model

        for (const m of modelsToTry) {
            try {
                const res = await fetch(`${OLLAMA_BASE}/v1/chat/completions`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: m,
                        messages,
                        max_tokens: maxTokens,
                        temperature,
                    }),
                    signal: AbortSignal.timeout(120_000),
                });

                if (!res.ok) {
                    const body = await res.text();
                    // If this model is missing and there's a fallback left, try it.
                    if (res.status === 404 || isModelNotFound(body)) {
                        if (m !== modelsToTry[modelsToTry.length - 1]) continue;
                    }
                    throw new Error(`Ollama ${res.status}: ${body}`);
                }

                const json = (await res.json()) as {
                    choices: { message: { content: string } }[];
                };
                return json.choices[0]?.message?.content?.trim() ?? '';
            } catch (err) {
                // Connection refused / network failure → signal to skip AI entirely.
                if (isConnectionError(err)) {
                    throw new OllamaUnavailableError();
                }
                // Model-not-found → try fallback if one is available.
                if (isModelNotFound(err) && m !== modelsToTry[modelsToTry.length - 1]) {
                    continue;
                }
                throw err;
            }
        }
        return '';
    }
}

/** Thrown when Ollama is not reachable so callers can skip gracefully. */
export class OllamaUnavailableError extends Error {
    constructor() {
        super('Ollama not running');
        this.name = 'OllamaUnavailableError';
    }
}

function isConnectionError(err: unknown): boolean {
    const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
    return (
        msg.includes('econnrefused') ||
        msg.includes('connection refused') ||
        msg.includes('fetch failed') ||
        msg.includes('network') ||
        msg.includes('enotfound') ||
        msg.includes('socket') ||
        (err instanceof TypeError && msg.includes('failed to fetch'))
    );
}

// ─── OpenAI ───────────────────────────────────────────────────────────────────

export class OpenAIProvider implements AIProvider {
    readonly name: AIProviderName = 'openai';

    constructor(private readonly apiKey: string) { }

    async chat(
        messages: ChatMessage[],
        model: string,
        maxTokens = 600,
        temperature = 0.3,
    ): Promise<string> {
        const isNewModel = model.startsWith('gpt-5') || model.startsWith('o3') || model.startsWith('o4');
        const body = {
            model,
            messages,
            ...(isNewModel
                ? { max_completion_tokens: maxTokens }
                : { max_tokens: maxTokens }
            ),
        };
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(120_000),
        });

        if (!res.ok) {
            const body = await res.text();
            throw new Error(`OpenAI ${res.status}: ${body}`);
        }
        const json = (await res.json()) as {
            choices: { message: { content: string } }[];
        };
        return json.choices[0]?.message?.content?.trim() ?? '';
    }
}

// ─── Anthropic ────────────────────────────────────────────────────────────────

export class AnthropicProvider implements AIProvider {
    readonly name: AIProviderName = 'anthropic';

    constructor(private readonly apiKey: string) { }

    async chat(
        messages: ChatMessage[],
        model: string,
        maxTokens = 600,
        temperature = 0.3,
    ): Promise<string> {
        // Anthropic separates the system prompt from user/assistant turns.
        const systemMsg = messages.find((m) => m.role === 'system')?.content ?? '';
        const turns = messages
            .filter((m) => m.role !== 'system')
            .map((m) => ({ role: m.role, content: m.content }));

        const body: Record<string, unknown> = {
            model,
            max_tokens: maxTokens,
            temperature,
            messages: turns,
        };
        if (systemMsg) body.system = systemMsg;

        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(120_000),
        });

        if (!res.ok) {
            const errBody = await res.text();
            throw new Error(`Anthropic ${res.status}: ${errBody}`);
        }
        const json = (await res.json()) as {
            content: { type: string; text: string }[];
        };
        return (
            json.content
                .filter((c) => c.type === 'text')
                .map((c) => c.text)
                .join('')
                .trim() ?? ''
        );
    }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export interface AIConfig {
    provider: AIProviderName;
    model: string;
    apiKey?: string;
}

export function buildProvider(cfg: AIConfig): AIProvider {
    switch (cfg.provider) {
        case 'openai':
            if (!cfg.apiKey) throw new Error('--key is required when using --ai openai');
            return new OpenAIProvider(cfg.apiKey);
        case 'anthropic':
            if (!cfg.apiKey) throw new Error('--key is required when using --ai anthropic');
            return new AnthropicProvider(cfg.apiKey);
        case 'ollama':
        default:
            return new OllamaProvider();
    }
}
