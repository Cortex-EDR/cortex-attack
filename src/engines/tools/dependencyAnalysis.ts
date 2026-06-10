import { runTool, isToolAvailable } from '../toolRunner.js';
import { ArtifactStore } from '../../utils/artifacts.js';
import { PhaseResult, Finding, ToolResult } from '../../types.js';
import { ui } from '../../ui/renderer.js';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs-extra';

export async function runDependencyAnalysis(cwd: string, store: ArtifactStore): Promise<PhaseResult> {
    const toolResults: ToolResult[] = [];
    const findings: Finding[] = [];

    ui.phase(5, 7, 'Dependency & Code Analysis');

    const trivyAvailable = await isToolAvailable('trivy');
    const semgrepAvailable = await isToolAvailable('semgrep');

    if (trivyAvailable) {
        ui.toolRun(`trivy fs --severity HIGH,CRITICAL ${cwd}`);
        const r = await runTool('trivy', ['fs', '--severity', 'HIGH,CRITICAL', '--format', 'json', '--quiet', cwd], store, 60000);
        toolResults.push(r);
        ui.toolOutput(r.stdout.length > 50 ? r.stdout : '(no vulnerabilities found)', r.artifactId);
        findings.push(...parseTrivyOutput(r.stdout, cwd));
    } else {
        ui.toolSkipped('trivy', 'https://trivy.dev/latest/getting-started/installation/');
    }

    if (semgrepAvailable) {
        const hasCode = await detectSourceCode(cwd);
        if (hasCode) {
            ui.toolRun(`semgrep --config=auto ${cwd} --json`);
            const r = await runTool('semgrep', ['--config=auto', cwd, '--json', '--quiet'], store, 120000);
            toolResults.push(r);
            ui.toolOutput(r.stdout.substring(0, 400) || '(no output)', r.artifactId);
            findings.push(...parseSemgrepOutput(r.stdout, cwd));
        } else {
            ui.toolSkipped('semgrep', 'no source code detected in current directory');
        }
    } else {
        ui.toolSkipped('semgrep', 'pip install semgrep');
    }

    if (!trivyAvailable && !semgrepAvailable) {
        ui.warn('Neither trivy nor semgrep available — skipping');
    } else {
        ui.success(`Dependency analysis complete — ${findings.length} findings`);
    }

    return { phase: 'dependency-analysis', success: true, toolResults, findings };
}

async function detectSourceCode(dir: string): Promise<boolean> {
    for (const f of ['package.json', 'requirements.txt', 'Gemfile', 'pom.xml', 'go.mod']) {
        if (await fs.pathExists(path.join(dir, f))) return true;
    }
    return false;
}

function parseTrivyOutput(output: string, target: string): Finding[] {
    const findings: Finding[] = [];
    try {
        const json = JSON.parse(output);
        for (const result of (json.Results || [])) {
            for (const vuln of (result.Vulnerabilities || [])) {
                findings.push({
                    id: `DEP-${uuidv4().split('-')[0].toUpperCase()}`,
                    title: `${vuln.PkgName}@${vuln.InstalledVersion}: ${vuln.VulnerabilityID}`,
                    severity: (vuln.Severity || 'LOW') as Finding['severity'],
                    category: 'Dependency Vulnerability',
                    target,
                    description: vuln.Description || `CVE in ${vuln.PkgName}`,
                    evidence: [`Package: ${vuln.PkgName}@${vuln.InstalledVersion}`, `Fixed in: ${vuln.FixedVersion || 'N/A'}`],
                    artifactIds: [],
                    remediation: vuln.FixedVersion ? `Upgrade ${vuln.PkgName} to ${vuln.FixedVersion}` : 'No fix available — consider replacing',
                    confidence: 95,
                    discoveredAt: new Date().toISOString(),
                    toolSources: ['trivy'],
                });
            }
        }
    } catch { }
    return findings;
}

function parseSemgrepOutput(output: string, target: string): Finding[] {
    const findings: Finding[] = [];
    try {
        const json = JSON.parse(output);
        for (const r of (json.results || [])) {
            const s = r.extra?.severity || 'WARNING';
            findings.push({
                id: `CODE-${uuidv4().split('-')[0].toUpperCase()}`,
                title: r.check_id?.split('.').slice(-2).join(' — ') || 'Code security issue',
                severity: s === 'ERROR' ? 'HIGH' : s === 'WARNING' ? 'MEDIUM' : 'LOW',
                category: 'Static Code Analysis',
                target,
                endpoint: r.path,
                description: r.extra?.message || r.check_id,
                evidence: [`File: ${r.path}:${r.start?.line}`, `Rule: ${r.check_id}`],
                artifactIds: [],
                remediation: r.extra?.fix || 'Review flagged code and apply secure coding practices.',
                confidence: 80,
                discoveredAt: new Date().toISOString(),
                toolSources: ['semgrep'],
            });
        }
    } catch { }
    return findings;
}