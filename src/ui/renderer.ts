import chalk from 'chalk';
import { Finding, AttackGraph, SessionSummary } from '../types.js';

const CORTEX_PURPLE = '#9D4EDD';
const CORTEX_CYAN = '#00F5D4';
const CORTEX_RED = '#FF3366';
const CORTEX_YELLOW = '#FFD166';
const CORTEX_GREEN = '#06D6A0';
const CORTEX_GRAY = '#6B7280';
const CORTEX_WHITE = '#F9FAFB';

export const ui = {
    banner(target: string): void {
        console.log('');
        console.log(chalk.hex(CORTEX_PURPLE)('╔══════════════════════════════════════════════════════════════╗'));
        console.log(chalk.hex(CORTEX_PURPLE)('║') + chalk.hex(CORTEX_CYAN).bold('   ██████╗ ██████╗ ██████╗ ████████╗███████╗██╗  ██╗          ') + chalk.hex(CORTEX_PURPLE)('║'));
        console.log(chalk.hex(CORTEX_PURPLE)('║') + chalk.hex(CORTEX_CYAN).bold('  ██╔════╝██╔═══██╗██╔══██╗╚══██╔══╝██╔════╝╚██╗██╔╝          ') + chalk.hex(CORTEX_PURPLE)('║'));
        console.log(chalk.hex(CORTEX_PURPLE)('║') + chalk.hex(CORTEX_CYAN).bold('  ██║     ██║   ██║██████╔╝   ██║   █████╗   ╚███╔╝           ') + chalk.hex(CORTEX_PURPLE)('║'));
        console.log(chalk.hex(CORTEX_PURPLE)('║') + chalk.hex(CORTEX_CYAN).bold('  ██║     ██║   ██║██╔══██╗   ██║   ██╔══╝   ██╔██╗           ') + chalk.hex(CORTEX_PURPLE)('║'));
        console.log(chalk.hex(CORTEX_PURPLE)('║') + chalk.hex(CORTEX_CYAN).bold('  ╚██████╗╚██████╔╝██║  ██║   ██║   ███████╗██╔╝ ██╗          ') + chalk.hex(CORTEX_PURPLE)('║'));
        console.log(chalk.hex(CORTEX_PURPLE)('║') + chalk.hex(CORTEX_CYAN).bold('   ╚═════╝ ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚══════╝╚═╝  ╚═╝          ') + chalk.hex(CORTEX_PURPLE)('║'));
        console.log(chalk.hex(CORTEX_PURPLE)('║') + '                                                              ' + chalk.hex(CORTEX_PURPLE)('║'));
        console.log(chalk.hex(CORTEX_PURPLE)('║') + chalk.hex(CORTEX_GRAY)('  Security Intelligence Orchestrator  ·  Passive Recon Mode   ') + chalk.hex(CORTEX_PURPLE)('║'));
        console.log(chalk.hex(CORTEX_PURPLE)('║') + chalk.hex(CORTEX_GRAY)('  https://github.com/Cortex-EDR/cortex-attack  ·  v0.1.0      ') + chalk.hex(CORTEX_PURPLE)('║'));
        console.log(chalk.hex(CORTEX_PURPLE)('╚══════════════════════════════════════════════════════════════╝'));
        console.log('');
        console.log(chalk.hex(CORTEX_PURPLE)('  Target  ') + chalk.hex(CORTEX_RED).bold(target));
        console.log(chalk.hex(CORTEX_GRAY)('  Mode    ') + chalk.hex(CORTEX_GREEN)('Passive Reconnaissance (no destructive actions)'));
        console.log(chalk.hex(CORTEX_GRAY)('  Policy  ') + chalk.hex(CORTEX_YELLOW)('localhost only · no credentials sent · no data modified'));
        console.log('');
    },

    phase(num: number, total: number, name: string): void {
        console.log('');
        console.log(chalk.hex(CORTEX_PURPLE)('━'.repeat(62)));
        console.log(chalk.hex(CORTEX_GRAY)(`  [${num}/${total}] `) + chalk.hex(CORTEX_WHITE).bold(name));
        console.log(chalk.hex(CORTEX_PURPLE)('━'.repeat(62)));
    },

    toolRun(command: string): void {
        console.log('');
        console.log(chalk.hex(CORTEX_GRAY)('  → ') + chalk.hex(CORTEX_CYAN)('running: ') + chalk.hex(CORTEX_WHITE)(command));
    },

    toolOutput(lines: string, artifactId: string): void {
        const truncated = lines.split('\n').slice(0, 20).join('\n');
        const formatted = truncated
            .split('\n')
            .map(l => chalk.hex(CORTEX_GRAY)('  │ ') + chalk.hex('#CBD5E1')(l))
            .join('\n');
        console.log(formatted);
        if (lines.split('\n').length > 20) {
            console.log(chalk.hex(CORTEX_GRAY)(`  │ ... (${lines.split('\n').length - 20} more lines)`));
        }
        console.log('');
        console.log(chalk.hex(CORTEX_GREEN)('  [ARTIFACT SAVED] ') + chalk.hex(CORTEX_GRAY)(artifactId));
    },

    toolSkipped(tool: string, reason: string): void {
        console.log(chalk.hex(CORTEX_YELLOW)('  [SKIP] ') + chalk.hex(CORTEX_WHITE)(tool) + chalk.hex(CORTEX_GRAY)(` — ${reason}`));
    },

    aiReasoning(label: string, text: string): void {
        console.log('');
        console.log(chalk.hex(CORTEX_PURPLE)('  ┌───────── ') + chalk.hex(CORTEX_PURPLE).bold('AI REASONING') + chalk.hex(CORTEX_GRAY)(` · ${label}`));
        for (const line of text.split('\n')) {
            console.log(chalk.hex(CORTEX_PURPLE)('  │ ') + chalk.hex(CORTEX_WHITE)(line));
        }
        console.log(chalk.hex(CORTEX_PURPLE)('  └───' + '─'.repeat(50)));
    },

    discovered(method: string, path: string, status?: number, flags?: string[]): void {
        const statusColor = status
            ? status < 300 ? CORTEX_GREEN : status < 400 ? CORTEX_YELLOW : CORTEX_RED
            : CORTEX_GRAY;
        const statusStr = status ? chalk.hex(statusColor)(`[${status}]`) : '';
        const flagStr = flags && flags.length > 0 ? chalk.hex(CORTEX_RED)(` ⚑ ${flags.join(', ')}`) : '';
        console.log(
            chalk.hex(CORTEX_GRAY)('  ') +
            chalk.hex(CORTEX_CYAN)(method.padEnd(6)) +
            chalk.hex(CORTEX_WHITE)(path.padEnd(45)) +
            statusStr + flagStr
        );
    },

    finding(f: Finding): void {
        const colors: Record<string, string> = {
            CRITICAL: CORTEX_RED, HIGH: '#FF6B35', MEDIUM: CORTEX_YELLOW, LOW: CORTEX_CYAN, INFO: CORTEX_GRAY,
        };
        const color = colors[f.severity] || CORTEX_GRAY;
        console.log('');
        console.log(chalk.hex(color)(`  ┌────── [${f.severity}] `) + chalk.hex(CORTEX_WHITE).bold(f.title) + chalk.hex(CORTEX_GRAY)(` · ${f.id}`));
        console.log(chalk.hex(color)('  │ ') + chalk.hex(CORTEX_GRAY)('Category:    ') + chalk.hex(CORTEX_WHITE)(f.category));
        if (f.endpoint) console.log(chalk.hex(color)('  │ ') + chalk.hex(CORTEX_GRAY)('Endpoint:    ') + chalk.hex(CORTEX_CYAN)(f.endpoint));
        console.log(chalk.hex(color)('  │ ') + chalk.hex(CORTEX_GRAY)('Confidence:  ') + chalk.hex(CORTEX_WHITE)(`${f.confidence}%`));
        console.log(chalk.hex(color)('  │ ') + chalk.hex(CORTEX_GRAY)('Evidence:    ') + chalk.hex(CORTEX_GRAY)(f.artifactIds.join(', ')));
        console.log(chalk.hex(color)('  │'));
        console.log(chalk.hex(color)('  │ ') + chalk.hex(CORTEX_WHITE)(f.description));
        console.log(chalk.hex(color)('  │'));
        console.log(chalk.hex(color)('  │ ') + chalk.hex(CORTEX_GRAY)('Fix: ') + chalk.hex(CORTEX_GREEN)(f.remediation));
        console.log(chalk.hex(color)('  └' + '─'.repeat(55)));
    },

    attackGraph(graph: AttackGraph): void {
        const impactColor: Record<string, string> = {
            CRITICAL: CORTEX_RED, HIGH: '#FF6B35', MEDIUM: CORTEX_YELLOW, LOW: CORTEX_CYAN,
        };
        const color = impactColor[graph.impact] || CORTEX_GRAY;
        console.log('');
        console.log(chalk.hex(CORTEX_PURPLE)('  ╔══ ') + chalk.hex(CORTEX_WHITE).bold('ATTACK GRAPH') + chalk.hex(CORTEX_GRAY)(` · ${graph.id}`));
        console.log(chalk.hex(CORTEX_PURPLE)('  ║  ') + chalk.hex(CORTEX_GRAY)('Impact:     ') + chalk.hex(color)(graph.impact));
        console.log(chalk.hex(CORTEX_PURPLE)('  ║  ') + chalk.hex(CORTEX_GRAY)('Likelihood: ') + chalk.hex(CORTEX_YELLOW)(graph.likelihood));
        console.log(chalk.hex(CORTEX_PURPLE)('  ║  ') + chalk.hex(CORTEX_GRAY)('Confidence: ') + chalk.hex(CORTEX_WHITE)(`${graph.confidence}%`));
        console.log(chalk.hex(CORTEX_PURPLE)('  ║'));
        for (const step of graph.steps) {
            console.log(
                chalk.hex(CORTEX_PURPLE)('  ║  ') +
                chalk.hex(CORTEX_GRAY)(`[${step.step}] `) +
                chalk.hex(CORTEX_CYAN)(step.actor.padEnd(12)) +
                chalk.hex(CORTEX_WHITE)(step.action) +
                chalk.hex(CORTEX_GRAY)(' → ') +
                chalk.hex(CORTEX_YELLOW)(step.result)
            );
            if (step.step < graph.steps.length) {
                console.log(chalk.hex(CORTEX_PURPLE)('  ║       ') + chalk.hex(CORTEX_GRAY)('↓'));
            }
        }
        console.log(chalk.hex(CORTEX_PURPLE)('  ║'));
        console.log(chalk.hex(CORTEX_PURPLE)('  ║  ') + chalk.hex(CORTEX_GRAY).italic(graph.narrative));
        console.log(chalk.hex(CORTEX_PURPLE)('  ╚' + '═'.repeat(55)));
    },

    summary(s: SessionSummary, sessionId: string, artifactDir: string): void {
        console.log('');
        console.log(chalk.hex(CORTEX_PURPLE)('═'.repeat(62)));
        console.log(chalk.hex(CORTEX_WHITE).bold('  CORTEX SESSION COMPLETE'));
        console.log(chalk.hex(CORTEX_PURPLE)('═'.repeat(62)));
        console.log('');
        console.log(chalk.hex(CORTEX_GRAY)('  Tools executed:   ') + chalk.hex(CORTEX_GREEN)(s.toolsRun.join(', ')));
        console.log(chalk.hex(CORTEX_GRAY)('  Endpoints found:  ') + chalk.hex(CORTEX_WHITE)(s.totalEndpoints.toString()));
        console.log(chalk.hex(CORTEX_GRAY)('  Total findings:   ') + chalk.hex(CORTEX_WHITE)(s.totalFindings.toString()));
        console.log('');
        console.log(
            chalk.hex(CORTEX_RED)(`  ● CRITICAL  ${s.criticalCount}`) + '   ' +
            chalk.hex('#FF6B35')(`HIGH  ${s.highCount}`) + '   ' +
            chalk.hex(CORTEX_YELLOW)(`MEDIUM  ${s.mediumCount}`) + '   ' +
            chalk.hex(CORTEX_CYAN)(`LOW  ${s.lowCount}`)
        );
        console.log('');
        console.log(chalk.hex(CORTEX_GRAY)('  ─── AI Security Narrative ─────────────────────────────'));
        for (const line of s.aiNarrative.split('\n')) {
            console.log(chalk.hex(CORTEX_WHITE)('  ') + chalk.hex('#CBD5E1')(line));
        }
        console.log('');
        console.log(chalk.hex(CORTEX_GRAY)('  Session ID:  ') + chalk.hex(CORTEX_CYAN)(sessionId));
        console.log(chalk.hex(CORTEX_GRAY)('  Artifacts:   ') + chalk.hex(CORTEX_CYAN)(artifactDir));
        console.log('');
        console.log(chalk.hex(CORTEX_GRAY)('  cortex report --session ') + chalk.hex(CORTEX_WHITE)(sessionId));
        console.log(chalk.hex(CORTEX_GRAY)('  cortex explain --finding <id>'));
        console.log(chalk.hex(CORTEX_GRAY)('  cortex timeline --session ') + chalk.hex(CORTEX_WHITE)(sessionId));
        console.log('');
        console.log(chalk.hex(CORTEX_PURPLE)('═'.repeat(62)));
        console.log('');
    },

    info(msg: string): void { console.log(chalk.hex(CORTEX_GRAY)('  [INFO]  ') + chalk.hex(CORTEX_WHITE)(msg)); },
    success(msg: string): void { console.log(chalk.hex(CORTEX_GREEN)('  [✓]    ') + chalk.hex(CORTEX_WHITE)(msg)); },
    warn(msg: string): void { console.log(chalk.hex(CORTEX_YELLOW)('  [WARN]  ') + chalk.hex(CORTEX_WHITE)(msg)); },
    error(msg: string): void { console.log(chalk.hex(CORTEX_RED)('  [ERR]   ') + chalk.hex(CORTEX_WHITE)(msg)); },
    event(timestamp: string, type: string, detail: string): void {
        console.log(chalk.hex(CORTEX_GRAY)(`  ${timestamp}  `) + chalk.hex(CORTEX_PURPLE)(type.padEnd(14)) + chalk.hex(CORTEX_WHITE)(detail));
    },
};