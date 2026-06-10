import { Command } from 'commander';
import fs from 'fs-extra';
import path from 'path';
import { loadConfig } from '../utils/config.js';
import { SessionData } from '../types.js';
import { ui } from '../ui/renderer.js';

export function sessionsCommand(): Command {
    const cmd = new Command('sessions');
    cmd.description('List all past assessment sessions').action(async () => {
        const config = await loadConfig();
        const dirs = await fs.readdir(config.sessionDir).catch(() => []);
        if (dirs.length === 0) { ui.info('No sessions found.'); return; }
        console.log('');
        for (const dir of dirs.sort().reverse()) {
            const sf = path.join(config.sessionDir, dir, 'session.json');
            if (!(await fs.pathExists(sf))) continue;
            const session = (await fs.readJson(sf)) as SessionData;
            const s = session.summary;
            ui.info(`${session.id}  →  ${session.target}  (${new Date(session.startedAt).toLocaleString()})`);
            if (s) console.log(`         C:${s.criticalCount} H:${s.highCount} M:${s.mediumCount} L:${s.lowCount}  |  ${s.totalEndpoints} endpoints\n`);
        }
    });
    return cmd;
}

export function timelineCommand(): Command {
    const cmd = new Command('timeline');
    cmd.description('Show event timeline for a session')
        .option('--session <id>', 'Session ID')
        .action(async (options) => {
            const config = await loadConfig();
            let sessionPath: string;
            if (options.session) {
                sessionPath = path.join(config.sessionDir, options.session);
            } else {
                const dirs = (await fs.readdir(config.sessionDir).catch(() => [])).sort().reverse();
                if (dirs.length === 0) { ui.error('No sessions found.'); return; }
                sessionPath = path.join(config.sessionDir, dirs[0]);
            }
            const sf = path.join(sessionPath, 'session.json');
            if (!(await fs.pathExists(sf))) { ui.error('Session not found.'); return; }
            const session = (await fs.readJson(sf)) as SessionData;
            console.log('');
            ui.phase(0, 0, `Timeline — ${session.id}`);
            for (const tr of session.toolResults) {
                const status = tr.exitCode === 0 ? '✓' : '!';
                ui.event(new Date(tr.timestamp).toLocaleTimeString(), `[${status}] ${tr.tool}`, `${tr.command.substring(0, 55)} (${tr.duration}ms)`);
            }
            console.log('');
        });
    return cmd;
}