import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Settings } from '../src/editor/settings.js';
import { FileManager } from '../src/editor/file-manager.js';
import { RecoveryManager } from '../src/editor/recovery.js';
import { createTab } from '../src/editor/tabs.js';

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'amo-recovery-')); }

test('recovery checkpoint survives simulated crash and can be applied', async () => {
  const dir = tmp();
  const file = path.join(dir, 'notes.txt');
  fs.writeFileSync(file, 'original');
  const settings = new Settings(dir);
  const fm = new FileManager();
  const load = await fm.load(file);
  const tab = createTab({ content: 'original', filePath: file, fingerprint: load.fingerprint });
  tab.buffer.setText('unsaved work');
  tab.modified = true;
  tab.cursor = { y: 0, x: 3 };

  const rm = new RecoveryManager(settings);
  const sid = rm.startSession([tab]);
  rm.checkpoint(tab);
  const sessions = new RecoveryManager(settings).findRecoverable();
  assert.ok(sessions.some(s => s.id === sid));
  const session = sessions.find(s => s.id === sid);
  const entry = session.files.find(f => f.filePath === file);
  assert.ok(entry);
  assert.equal(entry.content, 'unsaved work');
  const applied = await rm.applyEntry(entry, fm);
  assert.equal(applied.ok, true);
  assert.equal(applied.content, 'unsaved work');
  assert.deepEqual(applied.cursor, { y: 0, x: 3 });
});

test('recovery never silently overwrites a newer original', async () => {
  const dir = tmp();
  const file = path.join(dir, 'newer.txt');
  fs.writeFileSync(file, 'v1');
  const settings = new Settings(dir);
  const fm = new FileManager();
  const load = await fm.load(file);
  const tab = createTab({ content: 'v1', filePath: file, fingerprint: load.fingerprint });
  tab.modified = true;
  const rm = new RecoveryManager(settings);
  rm.startSession([tab]);
  tab.buffer.setText('my work');
  rm.checkpoint(tab);
  const session = new RecoveryManager(settings).findRecoverable()[0];
  const entry = session.files[0];
  fs.writeFileSync(file, 'newer version from another process');
  const res = await rm.applyEntry(entry, fm);
  assert.equal(res.ok, false);
  assert.equal(res.conflict, true);
  const forced = await rm.applyEntry(entry, fm, true);
  assert.equal(forced.ok, true);
});

test('clean exit removes recovery data', () => {
  const dir = tmp();
  const settings = new Settings(dir);
  const rm = new RecoveryManager(settings);
  rm.startSession([]);
  assert.ok(fs.existsSync(rm.sessionDir));
  rm.cleanExit();
  assert.equal(rm.findRecoverable().length, 0);
});

test('obsolete recovery data is cleaned up', () => {
  const dir = tmp();
  const settings = new Settings(dir);
  const old = path.join(settings.recoveryDir, 'old-session');
  fs.mkdirSync(old, { recursive: true });
  fs.writeFileSync(path.join(old, 'session.json'), '{}');
  const oldTime = new Date(Date.now() - 8 * 24 * 3600 * 1000);
  fs.utimesSync(old, oldTime, oldTime);
  const rm = new RecoveryManager(settings);
  rm.cleanupObsolete();
  assert.equal(fs.existsSync(old), false);
});
