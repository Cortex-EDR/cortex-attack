import { runTool } from '../toolRunner.js';
import { ArtifactStore } from '../../utils/artifacts.js';
import { PhaseResult, ToolResult } from '../../types.js';
import { ui } from '../../ui/renderer.js';

export async function runServiceDiscovery(host: string, port: string, store: ArtifactStore): Promise<PhaseResult> {
    const toolResults: ToolResult[] = [];
    const rawData: Record<string, unknown> = {};

    ui.phase(1, 7, 'Service Discovery');

    // nmap — runTool() handles: native → Docker → skip
    ui.toolRun(`nmap -sV -sC -p ${port} ${host}`);
    const nmapR = await runTool('nmap', ['-sV', '-sC', '-p', port, host], store, 30000);
    toolResults.push(nmapR);
    if (nmapR.exitCode !== -1 || nmapR.stdout) {
        ui.toolOutput(nmapR.stdout || nmapR.stderr, nmapR.artifactId);
        rawData.nmap = nmapR.stdout;
    } else {
        ui.toolSkipped('nmap', nmapR.stderr || 'not available locally or via Docker');
    }

    // curl — always available (native or Node fetch fallback)
    ui.toolRun(`curl -sI http://${host}:${port}`);
    const curlR = await runTool('curl', ['-sI', '--max-time', '10', `http://${host}:${port}`], store, 15000);
    toolResults.push(curlR);
    ui.toolOutput(curlR.stdout || '(no response)', curlR.artifactId);
    rawData.headers = curlR.stdout;

    // whatweb — runTool() handles: native → Docker → skip
    ui.toolRun(`whatweb http://${host}:${port}`);
    const wwR = await runTool('whatweb', [`http://${host}:${port}`], store, 20000);
    toolResults.push(wwR);
    if (wwR.exitCode !== -1 || wwR.stdout) {
        ui.toolOutput(wwR.stdout || wwR.stderr, wwR.artifactId);
    } else {
        ui.toolSkipped('whatweb', wwR.stderr || 'not available locally or via Docker');
    }

    return { phase: 'service-discovery', success: true, toolResults, rawData };
}