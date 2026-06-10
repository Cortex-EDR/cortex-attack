import { runTool } from '../toolRunner.js';
import { ArtifactStore } from '../../utils/artifacts.js';
import { PhaseResult, Endpoint, ToolResult } from '../../types.js';
import { ui } from '../../ui/renderer.js';

const COMMON_PATHS = [
    '/', '/health', '/healthz', '/ping', '/status', '/metrics',
    '/api', '/api/v1', '/api/v2', '/docs', '/swagger', '/swagger-ui',
    '/openapi.json', '/openapi.yaml', '/api-docs', '/graphql', '/graphiql',
    '/admin', '/dashboard', '/management', '/login', '/logout', '/auth',
    '/api/users', '/api/user', '/api/me', '/api/profile', '/api/auth',
    '/api/login', '/api/register', '/api/config', '/api/settings',
    '/api/info', '/api/version', '/env', '/.env', '/config',
    '/robots.txt', '/sitemap.xml', '/.well-known/security.txt',
    '/actuator', '/actuator/health', '/actuator/env', '/actuator/mappings',
    '/__debug__', '/__admin__',
];

export async function runRouteDiscovery(host: string, port: string, store: ArtifactStore): Promise<PhaseResult> {
    const toolResults: ToolResult[] = [];
    const endpoints: Endpoint[] = [];

    ui.phase(2, 7, 'Route & Endpoint Discovery');
    ui.info(`Probing ${COMMON_PATHS.length} common paths...`);

    const baseUrl = `http://${host}:${port}`;

    for (let i = 0; i < COMMON_PATHS.length; i += 10) {
        const chunk = COMMON_PATHS.slice(i, i + 10);
        const results = await Promise.all(chunk.map(p => probePath(baseUrl, p, store)));
        for (const r of results) {
            toolResults.push(r.toolResult);
            if (r.endpoint) {
                endpoints.push(r.endpoint);
                ui.discovered('GET', r.endpoint.path, r.endpoint.statusCode, r.endpoint.flags.length > 0 ? r.endpoint.flags : undefined);
            }
        }
    }

    // Try to parse OpenAPI spec
    const openApiEp = endpoints.find(e => e.path.includes('openapi') && e.statusCode === 200);
    if (openApiEp) {
        ui.info('OpenAPI spec detected — extracting routes...');
        const specR = await runTool('curl', ['-s', '--max-time', '10', `${baseUrl}${openApiEp.path}`], store, 15000);
        toolResults.push(specR);
        const extra = parseOpenApiRoutes(specR.stdout);
        for (const ep of extra) {
            if (!endpoints.find(e => e.path === ep.path && e.method === ep.method)) {
                endpoints.push(ep);
                ui.discovered(ep.method, ep.path);
            }
        }
        ui.success(`Extracted ${extra.length} routes from OpenAPI spec`);
    }

    ui.success(`Discovered ${endpoints.length} endpoints (${endpoints.filter(e => e.statusCode === 200).length} active)`);
    await store.saveArtifact('route-discovery', { endpoints, totalProbed: COMMON_PATHS.length });

    return { phase: 'route-discovery', success: true, toolResults, endpoints };
}

async function probePath(baseUrl: string, path: string, store: ArtifactStore): Promise<{ toolResult: ToolResult; endpoint?: Endpoint }> {
    const result = await runTool('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}|%{time_total}', '--max-time', '8', `${baseUrl}${path}`], store, 10000);
    const parts = result.stdout.trim().split('|');
    const statusCode = parseInt(parts[0] || '0', 10);
    if (statusCode === 0 || statusCode === 404) return { toolResult: result };
    const flags: string[] = [];
    if (path.includes('admin') || path.includes('management')) flags.push('ADMIN');
    if (path.includes('.env') || path.includes('config')) flags.push('CONFIG-EXPOSURE');
    if (path.includes('actuator')) flags.push('ACTUATOR');
    if (path.includes('graphql')) flags.push('GRAPHQL');
    if (path.includes('swagger') || path.includes('openapi')) flags.push('API-DOCS');
    if (statusCode === 200 && (path.includes('admin') || path.includes('debug'))) flags.push('UNPROTECTED');
    return { toolResult: result, endpoint: { method: 'GET', path, statusCode, responseTime: parseFloat(parts[1] || '0') * 1000, flags } };
}

function parseOpenApiRoutes(specJson: string): Endpoint[] {
    const endpoints: Endpoint[] = [];
    try {
        const spec = JSON.parse(specJson);
        for (const [path, methods] of Object.entries(spec.paths || {})) {
            for (const method of Object.keys(methods as object)) {
                if (['get', 'post', 'put', 'delete', 'patch'].includes(method)) {
                    endpoints.push({ method: method.toUpperCase(), path, flags: [] });
                }
            }
        }
    } catch { }
    return endpoints;
}