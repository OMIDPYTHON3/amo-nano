import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function safeId(filePath, index) {
  const hash = crypto.createHash('sha1').update(filePath || `untitled-${index}`).digest('hex').slice(0, 12);
  return `${hash}-${index}`;
}

export class RecoveryManager {
  constructor(settings) {
    this.settings = settings;
    this.dir = settings.recoveryDir;
    this.sessionId = null;
    this.sessionDir = null;
    this.dirty = new Set();
  }

  ensure() {
    try { fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 }); } catch { }
  }

  startSession(tabs = []) {
    this.ensure();
    this.sessionId = `${Date.now()}-${process.pid}-${crypto.randomBytes(3).toString('hex')}`;
    this.sessionDir = path.join(this.dir, this.sessionId);
    try {
      fs.mkdirSync(this.sessionDir, { recursive: true, mode: 0o700 });
      fs.writeFileSync(path.join(this.sessionDir, 'session.json'), JSON.stringify({
        id: this.sessionId, pid: process.pid, startedAt: Date.now(), files: []
      }, null, 2));
    } catch { }
    for (const tab of tabs) this.checkpoint(tab);
    return this.sessionId;
  }

  _writeJson(file, data) {
    try {
      const tmp = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(data), 'utf8');
      fs.renameSync(tmp, file);
    } catch { }
  }

  checkpoint(tab) {
    if (!this.sessionDir || !tab) return;
    const id = safeId(tab.filePath, tab.id);
    const file = path.join(this.sessionDir, `${id}.json`);
    this._writeJson(file, {
      id, index: tab.id, filePath: tab.filePath || null, language: tab.language,
      content: tab.buffer.getText(), cursor: { y: tab.cursor.y, x: tab.cursor.x },
      modified: tab.modified, readOnly: tab.readOnly,
      originalFingerprint: tab.fingerprint || null, savedAt: Date.now()
    });
    this.dirty.add(id);
    this._updateManifest();
  }

  _updateManifest() {
    if (!this.sessionDir) return;
    const manifestPath = path.join(this.sessionDir, 'session.json');
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      manifest.files = Array.from(this.dirty);
      manifest.updatedAt = Date.now();
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    } catch { }
  }

  cleanExit() {
    if (!this.sessionDir) return;
    try { fs.rmSync(this.sessionDir, { recursive: true, force: true }); } catch { }
    this.sessionDir = null;
    this.sessionId = null;
  }

  cleanupObsolete() {
    this.ensure();
    const now = Date.now();
    try {
      for (const entry of fs.readdirSync(this.dir)) {
        const full = path.join(this.dir, entry);
        let stat;
        try { stat = fs.statSync(full); } catch { continue; }
        if (!stat.isDirectory()) continue;
        if (now - stat.mtimeMs > MAX_AGE_MS) {
          try { fs.rmSync(full, { recursive: true, force: true }); } catch { }
        }
      }
    } catch { }
  }

  findRecoverable() {
    this.cleanupObsolete();
    const sessions = [];
    try {
      for (const entry of fs.readdirSync(this.dir)) {
        const full = path.join(this.dir, entry);
        let stat;
        try { stat = fs.statSync(full); } catch { continue; }
        if (!stat.isDirectory() || entry === this.sessionId) continue;
        const manifestPath = path.join(full, 'session.json');
        if (!fs.existsSync(manifestPath)) continue;
        try {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
          const files = [];
          for (const name of manifest.files || []) {
            const fp = path.join(full, `${name}.json`);
            if (!fs.existsSync(fp)) continue;
            try {
              const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
              if (data.modified !== false) files.push(data);
            } catch { }
          }
          if (files.length) sessions.push({ id: entry, directory: full, startedAt: manifest.startedAt || stat.mtimeMs, files });
        } catch { }
      }
    } catch { }
    return sessions.sort((a, b) => b.startedAt - a.startedAt);
  }

  readEntry(sessionDir, id) {
    try {
      return JSON.parse(fs.readFileSync(path.join(sessionDir, `${id}.json`), 'utf8'));
    } catch {
      return null;
    }
  }

  async applyEntry(entry, fileManager, force = false) {
    let currentFingerprint = null;
    if (entry.filePath) {
      const stat = await fileManager.stat(entry.filePath);
      if (stat) currentFingerprint = { mtimeMs: stat.mtimeMs, size: stat.size, ino: stat.ino };
    }
    const old = entry.originalFingerprint;
    if (!force && old && currentFingerprint && (
      old.mtimeMs !== currentFingerprint.mtimeMs ||
      old.size !== currentFingerprint.size ||
      old.ino !== currentFingerprint.ino
    )) {
      return { ok: false, conflict: true, error: 'Original file changed since recovery data was created.' };
    }
    return { ok: true, content: entry.content, filePath: entry.filePath, cursor: entry.cursor, language: entry.language };
  }

  discard(session) {
    try { fs.rmSync(session.directory, { recursive: true, force: true }); } catch { }
  }
}
