import fs from 'fs-extra';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { SessionData } from '../types.js';

export class ArtifactStore {
    private sessionDir: string;
    private sessionId: string;

    constructor(baseDir: string, sessionId: string) {
        this.sessionId = sessionId;
        this.sessionDir = path.join(baseDir, sessionId);
    }

    async init(): Promise<void> {
        await fs.ensureDir(this.sessionDir);
        await fs.ensureDir(path.join(this.sessionDir, 'artifacts'));
        await fs.ensureDir(path.join(this.sessionDir, 'findings'));
        await fs.ensureDir(path.join(this.sessionDir, 'raw'));
    }

    async saveArtifact(tool: string, data: unknown): Promise<string> {
        const id = `${tool}_${uuidv4().split('-')[0]}`;
        await fs.writeJson(path.join(this.sessionDir, 'artifacts', `${id}.json`), { id, tool, savedAt: new Date().toISOString(), data }, { spaces: 2 });
        return id;
    }

    async saveRaw(tool: string, content: string): Promise<string> {
        const id = `raw_${tool}_${uuidv4().split('-')[0]}`;
        await fs.writeFile(path.join(this.sessionDir, 'raw', `${id}.txt`), content, 'utf-8');
        return id;
    }

    async saveSession(session: SessionData): Promise<void> {
        await fs.writeJson(path.join(this.sessionDir, 'session.json'), session, { spaces: 2 });
    }

    getSessionDir(): string { return this.sessionDir; }
    getSessionId(): string { return this.sessionId; }
}