import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

export function resolvePath(input, cwd = process.cwd()) {
  let p = String(input ?? '').trim();
  if (p === '~') p = (process.env.HOME || '~');
  else if (p.startsWith('~/')) p = path.join(process.env.HOME || '', p.slice(2));
  p = p.replace(/\/+$/, '') || p;
  if (!path.isAbsolute(p)) p = path.join(cwd, p);
  return path.normalize(p);
}

export function formatFsError(e) {
  const code = e?.code || '';
  const messages = {
    EACCES: 'Permission denied', EPERM: 'Operation not permitted',
    ENOENT: 'No such file or directory', ENOTDIR: 'Not a directory',
    EISDIR: 'Is a directory', ENOSPC: 'No space left on device',
    EROFS: 'Read-only file system', EMFILE: 'Too many open files',
    ENFILE: 'Too many open files', EBUSY: 'Device or resource busy',
    ENAMETOOLONG: 'File name too long'
  };
  return `${messages[code] || e?.message || 'Unknown error'}${code ? ` (${code})` : ''}`;
}

function fingerprint(stat) {
  if (!stat) return null;
  return { mtimeMs: stat.mtimeMs, size: stat.size, ino: stat.ino };
}

export class FileManager {
  constructor() {
    this.cwd = process.cwd();
  }

  async stat(filePath) {
    try {
      return await fsp.stat(filePath);
    } catch (e) {
      if (e.code === 'ENOENT') return null;
      throw e;
    }
  }

  async load(filePath) {
    const resolved = resolvePath(filePath, this.cwd);
    try {
      const stat = await fsp.stat(resolved);
      if (stat.isDirectory()) return { ok: false, error: `Is a directory: ${resolved}`, path: resolved };
      let readOnly = (stat.mode & 0o222) === 0;
      try { await fsp.access(resolved, fs.constants.W_OK); } catch { readOnly = true; }
      let text = '';
      try {
        text = await fsp.readFile(resolved, 'utf8');
        if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
      } catch (e) {
        return { ok: false, error: formatFsError(e), path: resolved, readOnly: true };
      }
      const bytes = Buffer.from(text, 'utf8');
      if (bytes.includes(0xfffd) && !text.includes('\ufffd')) { }
      return {
        ok: true, text, path: resolved, readOnly,
        fingerprint: fingerprint(stat), stat
      };
    } catch (e) {
      return { ok: false, error: formatFsError(e), path: resolved };
    }
  }

  async save(filePath, text, expected = null, options = {}) {
    const resolved = resolvePath(filePath, this.cwd);
    const force = !!options.force;
    try {
      const currentStat = await fsp.stat(resolved).catch(e => e.code === 'ENOENT' ? null : Promise.reject(e));
      if (expected && currentStat && !force) {
        const old = expected;
        if (old.mtimeMs !== currentStat.mtimeMs || old.size !== currentStat.size || old.ino !== currentStat.ino) {
          return {
            ok: false, conflict: true, path: resolved,
            error: 'File changed on disk since it was opened. Not overwriting.'
          };
        }
      }
      let mode = 0o644;
      if (currentStat) mode = currentStat.mode & 0o7777;
      const dir = path.dirname(resolved);
      const tmp = path.join(dir, `.${path.basename(resolved)}.amo-${process.pid}-${Date.now()}.tmp`);
      const handle = await fsp.open(tmp, 'w', mode);
      try {
        await handle.writeFile(text, 'utf8');
        await handle.sync();
      } finally {
        await handle.close();
      }
      try {
        await fsp.rename(tmp, resolved);
      } catch (e) {
        await fsp.unlink(tmp).catch(() => { });
        throw e;
      }
      try {
        const dirHandle = await fsp.open(dir, 'r');
        try { await dirHandle.sync(); } catch { } finally { await dirHandle.close(); }
      } catch { }
      const newStat = await fsp.stat(resolved);
      return { ok: true, path: resolved, fingerprint: fingerprint(newStat), stat: newStat };
    } catch (e) {
      return { ok: false, error: formatFsError(e), path: resolved };
    }
  }

  async exists(filePath) {
    try { await fsp.access(filePath); return true; } catch { return false; }
  }

  isExternallyModified(tab) {
    if (!tab?.filePath || !tab?.fingerprint) return false;
    let stat;
    try { stat = fs.statSync(tab.filePath); } catch { return false; }
    const fp = tab.fingerprint;
    return stat.mtimeMs !== fp.mtimeMs || stat.size !== fp.size || stat.ino !== fp.ino;
  }

  async listFiles(dir, maxDepth = 4, maxResults = 500) {
    const results = [];
    const root = resolvePath(dir, this.cwd);
    async function walk(d, depth) {
      if (depth > maxDepth || results.length >= maxResults) return;
      let entries;
      try { entries = await fsp.readdir(d, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        if (results.length >= maxResults) break;
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === '.git') continue;
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) await walk(full, depth + 1);
        else if (entry.isFile()) results.push(path.relative(root, full));
      }
    }
    await walk(root, 0);
    return results.sort();
  }
}
