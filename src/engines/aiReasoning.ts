import { Finding, AttackGraph, Endpoint } from '../types.js';
import {
    AIProvider,
    AIConfig,
    OllamaUnavailableError,
    buildProvider,
    ChatMessage,
} from './aiProvider.js';

export { AIConfig } from './aiProvider.js';

/** Returned when AI reasoning is skipped (e.g. Ollama not running). */
const SKIP_SENTINEL = '__AI_SKIPPED__';

export function isAISkipped(s: string): boolean {
    return s === SKIP_SENTINEL;
}

export class AIReasoningEngine {
    private provider: AIProvider;
    private model: string;

    constructor(cfg: AIConfig) {
        this.provider = buildProvider(cfg);
        this.model = cfg.model;
    }

    // ── internal helper ────────────────────────────────────────────────────────

    private async call(
        messages: ChatMessage[],
        maxTokens: number,
        temperature: number,
    ): Promise<string> {
        try {
            const result = await this.provider.chat(messages, this.model, maxTokens, temperature);
            return result || 'Analysis unavailable.';
        } catch (err) {
            if (err instanceof OllamaUnavailableError) {
                // Propagate so the orchestrator can emit the skip message once.
                throw err;
            }
            return `AI analysis unavailable: ${(err as Error).message}`;
        }
    }

    // ── public API (same signatures as before) ─────────────────────────────────

    async analyzePhase(phase: string, rawData: string, context: string): Promise<string> {
        const messages: ChatMessage[] = [
            {
                role: 'system',
                content:
                    'You are Cortex, a senior security engineer AI. Analyze recon data. Be concise, specific, technical. 2-4 short paragraphs. Focus on: what was found, what it means for security, what an attacker would do.',
            },
            {
                role: 'user',
                content: `Phase: ${phase}\nContext: ${context}\n\nData:\n${rawData.substring(0, 2000)}`,
            },
        ];
        return this.call(messages, 400, 0.3);
    }

    async buildAttackGraphs(
        findings: Finding[],
        endpoints: Endpoint[],
        target: string,
    ): Promise<AttackGraph[]> {
        if (findings.length === 0) return [];

        const findingSummary = findings
            .slice(0, 20)
            .map(
                (f) =>
                    `[${f.severity}] ${f.title} — ${f.endpoint || f.target} — ${f.description.substring(0, 100)}`,
            )
            .join('\n');

        const endpointSummary = endpoints
            .slice(0, 30)
            .map((e) => `${e.method} ${e.path} [${e.statusCode}] ${e.flags.join(',')}`)
            .join('\n');

        const messages: ChatMessage[] = [
            {
                role: 'system',
                content:
                    'You are Cortex. Construct realistic attack graphs from recon findings. Return ONLY valid JSON array, no markdown.\n' +
                    'Format: [{"id":"AG-001","title":"...","likelihood":"HIGH|MEDIUM|LOW","impact":"CRITICAL|HIGH|MEDIUM|LOW","confidence":85,"narrative":"2 sentences","steps":[{"step":1,"actor":"Attacker","action":"...","target":"...","result":"..."}],"findingIds":["F-001"]}]\n' +
                    'Max 3 graphs. Evidence-backed only.',
            },
            {
                role: 'user',
                content: `Target: ${target}\n\nFindings:\n${findingSummary}\n\nEndpoints:\n${endpointSummary}`,
            },
        ];

        try {
            const raw = await this.call(messages, 1500, 0.2);
            if (raw === 'Analysis unavailable.' || raw.startsWith('AI analysis unavailable')) return [];
            return JSON.parse(raw.replace(/```json|```/g, '').trim()) as AttackGraph[];
        } catch {
            return [];
        }
    }

    async generateNarrative(
        findings: Finding[],
        attackGraphs: AttackGraph[],
        target: string,
        toolsRun: string[],
    ): Promise<string> {
        const critical = findings.filter((f) => f.severity === 'CRITICAL').length;
        const high = findings.filter((f) => f.severity === 'HIGH').length;
        const topGraph = attackGraphs[0];

        const messages: ChatMessage[] = [
            {
                role: 'system',
                content:
                    'You are Cortex. Write an executive security narrative — 3-4 paragraphs. Direct. Senior security engineer tone. No bullet points. Plain text.',
            },
            {
                role: 'user',
                content:
                    `Target: ${target}\nTools: ${toolsRun.join(', ')}\n` +
                    `Critical: ${critical}, High: ${high}, Total: ${findings.length}\n` +
                    `Top attack: ${topGraph ? topGraph.title + ' — ' + topGraph.narrative : 'none'}\n\n` +
                    `Top findings:\n${findings.slice(0, 5).map((f) => `- [${f.severity}] ${f.title}: ${f.description.substring(0, 80)}`).join('\n')}\n\nWrite the narrative.`,
            },
        ];

        try {
            return await this.call(messages, 600, 0.4);
        } catch {
            return `Assessment complete. ${findings.length} findings (${critical} critical, ${high} high).`;
        }
    }

    async explainFinding(finding: Finding): Promise<string> {
        const messages: ChatMessage[] = [
            {
                role: 'system',
                content:
                    'You are Cortex. Explain this security finding to a developer. Cover: what it is, how an attacker exploits it, real-world impact, how to fix it. Technical but accessible. 3-4 paragraphs.',
            },
            { role: 'user', content: JSON.stringify(finding, null, 2) },
        ];
        return this.call(messages, 800, 0.3);
    }
}

// ── Wrapper used in the orchestrator to skip Ollama cleanly ──────────────────

/**
 * Wraps an async call to AIReasoningEngine. If Ollama is unavailable, prints
 * the skip notice once and returns the sentinel string. Subsequent calls within
 * the same run will also return the sentinel (caller should check isAISkipped).
 */
export async function safeAICall<T>(
    fn: () => Promise<T>,
    onSkip: () => T,
    ollamaSkippedRef: { value: boolean },
): Promise<T> {
    if (ollamaSkippedRef.value) return onSkip();
    try {
        return await fn();
    } catch (err) {
        if (err instanceof OllamaUnavailableError) {
            ollamaSkippedRef.value = true;
            return onSkip();
        }
        throw err;
    }
}