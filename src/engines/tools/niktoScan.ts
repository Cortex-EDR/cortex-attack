import { runTool } from '../toolRunner.js';
import { ArtifactStore } from '../../utils/artifacts.js';
import { PhaseResult, Finding, ToolResult } from '../../types.js';
import { ui } from '../../ui/renderer.js';
import { v4 as uuidv4 } from 'uuid';

export async function runNiktoScan(host: string, port: string, store: ArtifactStore): Promise<PhaseResult> {
    const toolResults: ToolResult[] = [];
    const findings: Finding[] = [];

    ui.phase(4, 7, 'Web Vulnerability Scan (Nikto)');

    // runTool() handles: native nikto → Docker cortex-engine → skip
    ui.toolRun(`nikto -h http://${host}:${port} -Tuning 1234 -maxtime 60`);
    const niktoResult = await runTool(
        'nikto',
        ['-h', `http://${host}:${port}`, '-Tuning', '1234', '-maxtime', '60'],
        store,
        90000,
    );
    toolResults.push(niktoResult);

    const niktoRan = niktoResult.exitCode !== -1 || niktoResult.stdout.trim().length > 0;

    if (niktoRan) {
        // nikto produced output (local or Docker)
        ui.toolOutput(niktoResult.stdout || niktoResult.stderr, niktoResult.artifactId);

        for (const line of niktoResult.stdout.split('\n')) {
            if (!line.startsWith('+') || line.length <= 5) continue;
            const lower = line.toLowerCase();
            let severity: Finding['severity'] = 'LOW';
            if (lower.includes('osvdb') || lower.includes('cve')) severity = 'HIGH';
            if (lower.includes('dangerous') || lower.includes('critical')) severity = 'CRITICAL';
            findings.push({
                id: `NK-${uuidv4().split('-')[0].toUpperCase()}`,
                title: line.replace(/^\+\s*/, '').substring(0, 60),
                severity,
                category: 'Web Vulnerability',
                target: `http://${host}:${port}`,
                description: line.substring(2).trim(),
                evidence: [line.trim()],
                artifactIds: [niktoResult.artifactId],
                remediation: 'Review Nikto finding and apply appropriate mitigation.',
                confidence: 75,
                discoveredAt: new Date().toISOString(),
                toolSources: ['nikto'],
            });
        }

        ui.success(`Nikto complete — ${findings.length} issues found`);
    } else {
        // nikto unavailable (no Docker either) — fall back to manual path probes
        ui.toolSkipped('nikto', niktoResult.stderr || 'not available locally or via Docker');
        ui.info('Falling back to manual path probes...');

        const dangerousPaths = [
            '/phpinfo.php', '/info.php', '/.git/HEAD', '/.git/config',
            '/backup.zip', '/backup.sql', '/wp-admin', '/server-status',
        ];

        for (const dpath of dangerousPaths) {
            const r = await runTool(
                'curl',
                ['-s', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '5', `http://${host}:${port}${dpath}`],
                store,
                8000,
            );
            toolResults.push(r);
            if (parseInt(r.stdout.trim(), 10) === 200) {
                const artifactId = await store.saveArtifact('manual-probe', { path: dpath, status: 200 });
                findings.push({
                    id: `NK-${uuidv4().split('-')[0].toUpperCase()}`,
                    title: `Sensitive path accessible: ${dpath}`,
                    severity: dpath.includes('.git') ? 'CRITICAL' : 'HIGH',
                    category: 'Sensitive File Exposure',
                    target: `http://${host}:${port}`,
                    endpoint: dpath,
                    description: `${dpath} returned HTTP 200 — potentially sensitive data exposed`,
                    evidence: [`GET ${dpath} → 200 OK`],
                    artifactIds: [artifactId],
                    remediation: `Block ${dpath} in your web server config. Remove dev files from production.`,
                    confidence: 90,
                    discoveredAt: new Date().toISOString(),
                    toolSources: ['curl-manual'],
                });
            }
        }
    }

    return { phase: 'nikto-scan', success: true, toolResults, findings };
}