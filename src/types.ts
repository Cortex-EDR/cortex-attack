export type AIProviderName = 'ollama' | 'openai' | 'anthropic';

export interface CortexConfig {
    openaiApiKey: string;
    sessionDir: string;
    allowedTargets: string[];
    maxConcurrentTools: number;
    timeout: number;
    // AI provider preferences (persisted to ~/.cortex/config.json)
    aiProvider?: AIProviderName;
    aiModel?: string;
    aiKey?: string;
}

export interface ToolResult {
    tool: string;
    command: string;
    stdout: string;
    stderr: string;
    exitCode: number;
    duration: number;
    timestamp: string;
    artifactId: string;
}

export interface Endpoint {
    method: string;
    path: string;
    statusCode?: number;
    responseTime?: number;
    headers?: Record<string, string>;
    flags: string[];
}

export interface Finding {
    id: string;
    title: string;
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
    category: string;
    target: string;
    endpoint?: string;
    description: string;
    evidence: string[];
    artifactIds: string[];
    attackPath?: AttackStep[];
    remediation: string;
    confidence: number;
    discoveredAt: string;
    toolSources: string[];
}

export interface AttackStep {
    step: number;
    actor: string;
    action: string;
    target: string;
    result: string;
}

export interface AttackGraph {
    id: string;
    title: string;
    likelihood: 'LOW' | 'MEDIUM' | 'HIGH';
    impact: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    confidence: number;
    steps: AttackStep[];
    findingIds: string[];
    narrative: string;
}

export interface SessionData {
    id: string;
    target: string;
    startedAt: string;
    completedAt?: string;
    toolResults: ToolResult[];
    endpoints: Endpoint[];
    findings: Finding[];
    attackGraphs: AttackGraph[];
    summary?: SessionSummary;
}

export interface SessionSummary {
    totalEndpoints: number;
    totalFindings: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    toolsRun: string[];
    topAttackPath?: AttackGraph;
    aiNarrative: string;
}

export interface PhaseResult {
    phase: string;
    success: boolean;
    toolResults: ToolResult[];
    endpoints?: Endpoint[];
    findings?: Finding[];
    rawData?: Record<string, unknown>;
}