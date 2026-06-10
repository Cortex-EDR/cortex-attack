import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { SessionData, Finding, Endpoint, ToolResult } from '../types.js';
import { loadConfig, isLocalhostTarget } from '../utils/config.js';
import { ArtifactStore } from '../utils/artifacts.js';
import { AIReasoningEngine, safeAICall } from './aiReasoning.js';
import { OllamaUnavailableError } from './aiProvider.js';
import { runServiceDiscovery } from './tools/serviceDiscovery.js';
import { runRouteDiscovery } from './tools/routeDiscovery.js';
import { runHeaderAnalysis } from './tools/headerAnalysis.js';
import { runNiktoScan } from './tools/niktoScan.js';
import { runDependencyAnalysis } from './tools/dependencyAnalysis.js';
import { buildAttackGraphs } from './attackGraph.js';
import { checkAvailableTools, isDockerAvailable } from './toolRunner.js';
import { ui } from '../ui/renderer.js';
import type { AIProviderName } from '../types.js';

export interface AttackOptions {
    cwd?: string;
    verbose?: boolean;
    ai?: AIProviderName;
    model?: string;
    key?: string;
    artifactsDir?: string;
}

export async function runAttack(target: string, options: AttackOptions): Promise<void> {
    if (!isLocalhostTarget(target)) {
        ui.error('Cortex only supports localhost targets in this release.');
        ui.info('Target must be: localhost, 127.0.0.1, or 0.0.0.0');
        process.exit(1);
    }

    const cleanTarget = target.replace(/^https?:\/\//, '');
    const [host, portStr] = cleanTarget.includes(':')
        ? [cleanTarget.split(':')[0], cleanTarget.split(':')[1]]
        : [cleanTarget, '8000'];
    const port = portStr || '8000';

    const config = await loadConfig();

    // ── Resolve AI config (CLI flags → stored config → defaults) ──────────────
    const aiProvider: AIProviderName = options.ai ?? config.aiProvider ?? 'ollama';
    const aiModel = options.model ?? config.aiModel ?? (aiProvider === 'openai' ? 'gpt-4o' : aiProvider === 'anthropic' ? 'claude-3-5-sonnet-20241022' : 'llama3.2');
    const aiKey = options.key ?? config.aiKey ?? config.openaiApiKey ?? '';

    // Validate key for providers that need one
    if ((aiProvider === 'openai' || aiProvider === 'anthropic') && !aiKey) {
        ui.error(`--key <api-key> is required when using --ai ${aiProvider}`);
        process.exit(1);
    }

    const ai = new AIReasoningEngine({ provider: aiProvider, model: aiModel, apiKey: aiKey });

    // Track whether Ollama was detected as unavailable so we skip all AI calls
    const ollamaSkipped = { value: false };

    const sessionId = `session_${uuidv4().split('-')[0]}`;
    const artifactsDir = options.artifactsDir ? path.resolve(options.artifactsDir) : config.sessionDir;
    const store = new ArtifactStore(artifactsDir, sessionId);
    await store.init();
    const cwd = options.cwd || process.cwd();

    ui.banner(`${host}:${port}`);

    // ── Tool availability report ───────────────────────────────────────────────
    const availableTools = await checkAvailableTools();
    const dockerOk = await isDockerAvailable();
    const available = Object.entries(availableTools).filter(([, v]) => v).map(([k]) => k);
    const missing = Object.entries(availableTools).filter(([, v]) => !v).map(([k]) => k);

    ui.info(`Available tools: ${available.join(', ')}`);
    if (missing.length > 0) {
        if (dockerOk) {
            ui.info(`Missing locally (will use Docker): ${missing.join(', ')}`);
        } else {
            ui.warn(`Missing (no Docker fallback): ${missing.join(', ')}`);
        }
    }
    ui.info(`AI provider: ${aiProvider}  model: ${aiModel}`);

    console.log('');
    ui.info('Starting assessment. All actions are passive — no data will be modified.');
    ui.info(`Artifacts → ${store.getSessionDir()}`);

    const allFindings: Finding[] = [];
    const allEndpoints: Endpoint[] = [];
    const allToolResults: ToolResult[] = [];
    const toolsRun: string[] = [];

    // ── Phase 1: Service Discovery ─────────────────────────────────────────────
    const phase1 = await runServiceDiscovery(host, port, store);
    allToolResults.push(...phase1.toolResults);
    toolsRun.push('nmap', 'curl');
    if (availableTools['whatweb']) toolsRun.push('whatweb');
    const nmapOutput = phase1.toolResults.find((t) => t.tool === 'nmap')?.stdout || '';
    if (nmapOutput) {
        const reasoning = await safeAICall(
            () => ai.analyzePhase('Service Discovery', nmapOutput, `Target: ${host}:${port}`),
            () => '',
            ollamaSkipped,
        );
        if (ollamaSkipped.value && !reasoning) {
            ui.warn('[AI SKIP] Ollama not running — install from ollama.com');
        } else if (reasoning) {
            ui.aiReasoning('Service Fingerprint', reasoning);
        }
    }

    // ── Phase 2: Route Discovery ───────────────────────────────────────────────
    const phase2 = await runRouteDiscovery(host, port, store);
    allToolResults.push(...phase2.toolResults);
    allEndpoints.push(...(phase2.endpoints || []));
    toolsRun.push('cortex-crawler');
    const endpointSummary = allEndpoints.slice(0, 15).map((e) => `${e.method} ${e.path} [${e.statusCode}]`).join('\n');
    if (endpointSummary) {
        const reasoning = await safeAICall(
            () => ai.analyzePhase('Route Discovery', endpointSummary, `Found ${allEndpoints.length} endpoints`),
            () => '',
            ollamaSkipped,
        );
        if (reasoning) ui.aiReasoning('Attack Surface', reasoning);
    }

    // ── Phase 3: Header Analysis ───────────────────────────────────────────────
    const phase3 = await runHeaderAnalysis(host, port, store);
    allToolResults.push(...phase3.toolResults);
    allFindings.push(...(phase3.findings || []));
    if (phase3.findings && phase3.findings.length > 0) {
        const reasoning = await safeAICall(
            () => ai.analyzePhase('HTTP Security Headers', phase3.findings!.map((f) => `[${f.severity}] ${f.title}`).join('\n'), 'Header analysis'),
            () => '',
            ollamaSkipped,
        );
        if (reasoning) ui.aiReasoning('Header Security', reasoning);
        for (const f of phase3.findings.filter((f) => f.severity !== 'LOW')) ui.finding(f);
    }

    // ── Phase 4: Nikto ────────────────────────────────────────────────────────
    const phase4 = await runNiktoScan(host, port, store);
    allToolResults.push(...phase4.toolResults);
    allFindings.push(...(phase4.findings || []));
    if (availableTools['nikto']) toolsRun.push('nikto');
    for (const f of (phase4.findings || []).filter((f) => ['CRITICAL', 'HIGH'].includes(f.severity))) ui.finding(f);

    // ── Phase 5: Dependency Analysis ───────────────────────────────────────────
    const phase5 = await runDependencyAnalysis(cwd, store);
    allToolResults.push(...phase5.toolResults);
    allFindings.push(...(phase5.findings || []));
    if (availableTools['trivy']) toolsRun.push('trivy');
    if (availableTools['semgrep']) toolsRun.push('semgrep');
    for (const f of (phase5.findings || []).filter((f) => f.severity === 'CRITICAL')) ui.finding(f);

    // ── Phase 6: Consolidation ─────────────────────────────────────────────────
    ui.phase(6, 7, 'Findings Consolidation');
    const critCount = allFindings.filter((f) => f.severity === 'CRITICAL').length;
    const highCount = allFindings.filter((f) => f.severity === 'HIGH').length;
    const medCount = allFindings.filter((f) => f.severity === 'MEDIUM').length;
    const lowCount = allFindings.filter((f) => f.severity === 'LOW').length;
    ui.success(`Total: ${allFindings.length}  (C:${critCount} H:${highCount} M:${medCount} L:${lowCount})`);

    // ── Phase 7: Attack Graph + Narrative ─────────────────────────────────────
    const attackGraphs = await buildAttackGraphs(allFindings, allEndpoints, `${host}:${port}`, ai, store);

    ui.info('Generating final security narrative...');
    const narrative = await safeAICall(
        () => ai.generateNarrative(allFindings, attackGraphs, `${host}:${port}`, toolsRun),
        () => `Assessment complete. ${allFindings.length} findings (${critCount} critical, ${highCount} high).`,
        ollamaSkipped,
    );

    const session: SessionData = {
        id: sessionId,
        target: `${host}:${port}`,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        toolResults: allToolResults,
        endpoints: allEndpoints,
        findings: allFindings,
        attackGraphs,
        summary: {
            totalEndpoints: allEndpoints.length,
            totalFindings: allFindings.length,
            criticalCount: critCount,
            highCount,
            mediumCount: medCount,
            lowCount,
            toolsRun: [...new Set(toolsRun)],
            topAttackPath: attackGraphs[0],
            aiNarrative: narrative,
        },
    };

    await store.saveSession(session);
    ui.summary(session.summary!, sessionId, store.getSessionDir());
}