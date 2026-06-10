import { spawn, execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs-extra';
import path from 'path';
import which from 'which';
import { ToolResult } from '../types.js';
import { ArtifactStore } from '../utils/artifacts.js';

const execFileAsync = promisify(execFile);

// ─── Constants ────────────────────────────────────────────────────────────────

const DOCKER_IMAGE_REGISTRY = 'ghcr.io/cortex-edr/cortex-attack';
const DOCKER_IMAGE_LOCAL = 'cortex-engine';

// ─── Tool availability ────────────────────────────────────────────────────────

export async function isToolAvailable(tool: string): Promise<boolean> {
    try {
        await which(tool);
        return true;
    } catch {
        return false;
    }
}

export async function checkAvailableTools(): Promise<Record<string, boolean>> {
    const tools = ['nmap', 'nikto', 'curl', 'semgrep', 'trivy', 'whatweb'];
    const results: Record<string, boolean> = {};
    for (const tool of tools) results[tool] = await isToolAvailable(tool);
    // curl is always "available" — we fall back to Node fetch if needed
    results['curl'] = true;
    return results;
}

// ─── Docker helpers ───────────────────────────────────────────────────────────

/** True if `docker version` exits cleanly (daemon is reachable). */
export async function isDockerAvailable(): Promise<boolean> {
    try {
        await execFileAsync('docker', ['version'], { timeout: 8_000 });
        return true;
    } catch {
        return false;
    }
}

/** Walk parent directories of __dirname until a Dockerfile is found. */
function findPackageRoot(): string {
    let dir = __dirname; // <repo>/dist in compiled build
    for (let i = 0; i < 10; i++) {
        if (fs.existsSync(path.join(dir, 'Dockerfile'))) return dir;
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }
    return process.cwd();
}

/**
 * Ensure the cortex-engine Docker image is present locally.
 *   1. Try docker pull ghcr.io/upvista/cortex-engine   (fast if image exists)
 *   2. On pull failure → build from local Dockerfile
 */
async function ensureDockerImage(): Promise<string> {
    // 1. Try registry pull
    try {
        await execFileAsync('docker', ['pull', DOCKER_IMAGE_REGISTRY], { timeout: 300_000 });
        await execFileAsync('docker', ['tag', DOCKER_IMAGE_REGISTRY, DOCKER_IMAGE_LOCAL], { timeout: 10_000 });
        return DOCKER_IMAGE_LOCAL;
    } catch {
        // pull failed — try local build
    }

    // 2. Local build
    const pkgRoot = findPackageRoot();
    await execFileAsync('docker', ['build', '-t', DOCKER_IMAGE_LOCAL, pkgRoot], {
        timeout: 600_000, // 10 min
    });
    return DOCKER_IMAGE_LOCAL;
}

// ─── Core spawn helper ────────────────────────────────────────────────────────

function spawnProcess(
    command: string,
    args: string[],
    timeoutMs: number,
): Promise<{ stdout: string; stderr: string; exitCode: number; timedOut: boolean }> {
    return new Promise((resolve) => {
        let stdout = '',
            stderr = '',
            timedOut = false;

        const proc = spawn(command, args, { env: { ...process.env } });
        const timer = setTimeout(() => {
            timedOut = true;
            proc.kill('SIGTERM');
        }, timeoutMs);

        proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
        proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });

        proc.on('close', (code) => {
            clearTimeout(timer);
            resolve({ stdout, stderr, exitCode: timedOut ? -1 : (code ?? 0), timedOut });
        });

        proc.on('error', (err) => {
            clearTimeout(timer);
            resolve({ stdout: '', stderr: err.message, exitCode: -1, timedOut: false });
        });
    });
}

// ─── Docker run ───────────────────────────────────────────────────────────────

/**
 * Run `command args` inside the cortex-engine container.
 * --rm: ephemeral, --network=host: reaches localhost services.
 * Nothing is mounted into the container.
 */
export async function runToolInDocker(
    command: string,
    args: string[],
    store: ArtifactStore,
    timeoutMs = 120_000,
): Promise<ToolResult> {
    const startTime = Date.now();
    const timestamp = new Date().toISOString();

    let image: string;
    try {
        image = await ensureDockerImage();
    } catch (buildErr) {
        const msg = `[Docker] Failed to pull/build ${DOCKER_IMAGE_LOCAL}: ${(buildErr as Error).message}`;
        console.warn(msg);
        const artifactId = await store.saveRaw(command, msg);
        return {
            tool: command,
            command: `docker run --rm ${DOCKER_IMAGE_LOCAL} ${command} ${args.join(' ')}`,
            stdout: '',
            stderr: msg,
            exitCode: -1,
            duration: Date.now() - startTime,
            timestamp,
            artifactId,
        };
    }

    // Pass the full command as a shell string to the bash entrypoint
    const shellCmd = [command, ...args].map((a) => JSON.stringify(a)).join(' ');
    const dockerArgs = ['run', '--rm', '--network=host', image, shellCmd];

    const { stdout, stderr, exitCode, timedOut } = await spawnProcess(
        'docker',
        dockerArgs,
        timeoutMs,
    );

    const finalStdout = timedOut ? stdout + '\n[TIMED OUT]' : stdout;
    const artifactId = await store.saveRaw(command, finalStdout || stderr);

    return {
        tool: command,
        command: `docker run --rm ${image} ${command} ${args.join(' ')}`,
        stdout: finalStdout,
        stderr,
        exitCode: timedOut ? -1 : exitCode,
        duration: Date.now() - startTime,
        timestamp,
        artifactId,
    };
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Run a security tool.
 *
 * Priority:
 *   1. Native binary on PATH.
 *   2. Docker container (cortex-engine) if Docker daemon is reachable.
 *   3. Warn + return empty result if neither is available.
 */
export async function runTool(
    command: string,
    args: string[],
    store: ArtifactStore,
    timeoutMs = 60_000,
): Promise<ToolResult> {
    const startTime = Date.now();
    const timestamp = new Date().toISOString();

    // ── 1. Native ─────────────────────────────────────────────────────────────
    if (await isToolAvailable(command)) {
        const { stdout, stderr, exitCode, timedOut } = await spawnProcess(command, args, timeoutMs);
        const finalStdout = timedOut ? stdout + '\n[TIMED OUT]' : stdout;
        const artifactId = await store.saveRaw(command, finalStdout || stderr);
        return {
            tool: command,
            command: `${command} ${args.join(' ')}`,
            stdout: finalStdout,
            stderr,
            exitCode: timedOut ? -1 : exitCode,
            duration: Date.now() - startTime,
            timestamp,
            artifactId,
        };
    }

    // ── 2. Docker fallback ────────────────────────────────────────────────────
    if (await isDockerAvailable()) {
        return runToolInDocker(command, args, store, Math.max(timeoutMs, 120_000));
    }

    // ── 3. Skip gracefully ────────────────────────────────────────────────────
    const msg = `[WARN] ${command} not installed and Docker is unavailable — skipping`;
    console.warn(msg);
    const artifactId = await store.saveRaw(command, msg);
    return {
        tool: command,
        command: `${command} ${args.join(' ')}`,
        stdout: '',
        stderr: msg,
        exitCode: -1,
        duration: Date.now() - startTime,
        timestamp,
        artifactId,
    };
}