import { runTool } from '../toolRunner.js';
import { ArtifactStore } from '../../utils/artifacts.js';
import { PhaseResult, Finding, ToolResult } from '../../types.js';
import { ui } from '../../ui/renderer.js';
import { v4 as uuidv4 } from 'uuid';

const SECURITY_HEADERS = [
    { name: 'strict-transport-security', severity: 'MEDIUM' as const, desc: 'HSTS not set — HTTP downgrade attacks possible' },
    { name: 'content-security-policy', severity: 'HIGH' as const, desc: 'CSP missing — XSS risk elevated' },
    { name: 'x-frame-options', severity: 'MEDIUM' as const, desc: 'Clickjacking protection absent' },
    { name: 'x-content-type-options', severity: 'LOW' as const, desc: 'MIME sniffing not disabled' },
    { name: 'referrer-policy', severity: 'LOW' as const, desc: 'Referrer policy not configured' },
    { name: 'permissions-policy', severity: 'LOW' as const, desc: 'Permissions policy not set' },
];

export async function runHeaderAnalysis(host: string, port: string, store: ArtifactStore): Promise<PhaseResult> {
    const toolResults: ToolResult[] = [];
    const findings: Finding[] = [];

    ui.phase(3, 7, 'HTTP Security Header Analysis');

    for (const ep of ['/', '/api', '/login']) {
        const url = `http://${host}:${port}${ep}`;
        ui.toolRun(`curl -sI ${url}`);
        const result = await runTool('curl', ['-sI', '--max-time', '10', url], store, 12000);
        toolResults.push(result);
        const headers = parseHeaders(result.stdout);
        const artifactId = await store.saveArtifact('headers', { url, headers });
        ui.toolOutput(result.stdout.substring(0, 600), result.artifactId);

        for (const check of SECURITY_HEADERS) {
            if (!headers[check.name]) {
                findings.push({
                    id: `H-${uuidv4().split('-')[0].toUpperCase()}`,
                    title: `Missing security header: ${check.name}`,
                    severity: check.severity,
                    category: 'HTTP Security Headers',
                    target: `http://${host}:${port}`,
                    endpoint: ep,
                    description: check.desc,
                    evidence: [`Header absent in response from ${url}`],
                    artifactIds: [artifactId],
                    remediation: `Add "${check.name}" to all HTTP responses. See OWASP Secure Headers Project.`,
                    confidence: 95,
                    discoveredAt: new Date().toISOString(),
                    toolSources: ['curl'],
                });
            }
        }

        const server = headers['server'] || '';
        if (server && /\d/.test(server)) {
            findings.push({
                id: `H-${uuidv4().split('-')[0].toUpperCase()}`,
                title: 'Server version disclosure',
                severity: 'LOW',
                category: 'Information Disclosure',
                target: `http://${host}:${port}`,
                endpoint: ep,
                description: `Server header reveals: "${server}" — exposes software version to attackers`,
                evidence: [`Server: ${server}`],
                artifactIds: [artifactId],
                remediation: 'Remove or obscure the Server header in your web server config.',
                confidence: 100,
                discoveredAt: new Date().toISOString(),
                toolSources: ['curl'],
            });
        }

        if (headers['access-control-allow-origin'] === '*') {
            findings.push({
                id: `H-${uuidv4().split('-')[0].toUpperCase()}`,
                title: 'Wildcard CORS policy',
                severity: 'HIGH',
                category: 'CORS Misconfiguration',
                target: `http://${host}:${port}`,
                endpoint: ep,
                description: 'Access-Control-Allow-Origin: * allows any origin to read responses',
                evidence: [`access-control-allow-origin: *`, `Found at: ${url}`],
                artifactIds: [artifactId],
                remediation: 'Restrict CORS to specific trusted origins. Never wildcard on authenticated endpoints.',
                confidence: 100,
                discoveredAt: new Date().toISOString(),
                toolSources: ['curl'],
            });
        }
    }

    ui.success(`Header analysis complete — ${findings.length} findings`);
    return { phase: 'header-analysis', success: true, toolResults, findings };
}

function parseHeaders(raw: string): Record<string, string> {
    const headers: Record<string, string> = {};
    for (const line of raw.split('\n')) {
        const idx = line.indexOf(':');
        if (idx > 0) headers[line.substring(0, idx).trim().toLowerCase()] = line.substring(idx + 1).trim();
    }
    return headers;
}