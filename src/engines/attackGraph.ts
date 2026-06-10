import { Finding, Endpoint, AttackGraph } from '../types.js';
import { AIReasoningEngine } from './aiReasoning.js';
import { ArtifactStore } from '../utils/artifacts.js';
import { ui } from '../ui/renderer.js';

export async function buildAttackGraphs(
    findings: Finding[], endpoints: Endpoint[], target: string,
    ai: AIReasoningEngine, store: ArtifactStore
): Promise<AttackGraph[]> {
    ui.phase(7, 7, 'Attack Graph Construction');
    ui.info(`Correlating ${findings.length} findings across ${endpoints.length} endpoints...`);

    const actionable = findings.filter(f => ['CRITICAL', 'HIGH', 'MEDIUM'].includes(f.severity));
    if (actionable.length === 0) { ui.info('No actionable findings to build attack graph from'); return []; }

    ui.info('Sending evidence to AI reasoning engine...');
    const graphs = await ai.buildAttackGraphs(actionable, endpoints, target);

    if (graphs.length === 0) { ui.warn('AI could not construct attack paths from available evidence'); return []; }

    for (const graph of graphs) {
        await store.saveArtifact('attack-graph', graph);
        ui.attackGraph(graph);
    }

    return graphs;
}